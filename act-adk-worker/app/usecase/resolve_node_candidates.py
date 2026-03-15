"""ResolveNodeCandidates usecase — lightweight LLM ranking over visible graph nodes."""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from app.domain.models import (
    CandidateNode,
    CandidateResolutionInput,
    CandidateResolutionOutput,
    LLMConfig,
    PromptBundle,
)
from app.domain.ports import LLMPort

logger = logging.getLogger(__name__)


def _extract_json_object(text: str) -> str | None:
    stripped = text.strip()
    if not stripped:
        return None
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if "\n" in stripped:
            stripped = stripped.split("\n", 1)[1]
        stripped = stripped.strip()
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or start >= end:
        return None
    return stripped[start : end + 1]


def _truncate(text: str, limit: int = 220) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3] + "..."


def _build_prompt(input: CandidateResolutionInput) -> PromptBundle:
    system_instruction = (
        "CANDIDATE_SELECTION_JSON\n"
        "You resolve which visible frontend nodes most likely match the user's ambiguous reference.\n"
        "Return JSON only.\n"
        "Schema:\n"
        '{ "candidates": [ { "node_id": "string", "label": "string", "reason": "string" } ] }\n'
        "Rules:\n"
        "- Use only node_id values that appear in the provided visible graph.\n"
        "- Return at most max_candidates items.\n"
        "- Prefer the visible node titles that best match the user's intent.\n"
        "- Reasons must be short and concrete.\n"
        "- If unsure, still choose the closest visible candidates instead of refusing.\n"
    )

    graph_lines: list[str] = []
    for node in input.nodes:
        graph_lines.append(
            json.dumps(
                {
                    "node_id": node.node_id,
                    "title": node.title,
                    "content_md": _truncate(node.content_md or "", 180),
                    "selected": node.selected,
                    "source": node.source,
                },
                ensure_ascii=False,
            )
        )

    user_prompt = (
        f"user_message: {input.user_message}\n"
        f"active_node_id: {input.active_node_id or ''}\n"
        f"selected_node_ids: {input.selected_node_ids}\n"
        f"max_candidates: {input.max_candidates}\n"
        "visible_graph_nodes:\n"
        + "\n".join(graph_lines)
    )
    return PromptBundle(system_instruction=system_instruction, user_prompt=user_prompt, context_blocks=[])


class ResolveNodeCandidatesUsecase:
    def __init__(self, llm: LLMPort):
        self._llm = llm

    async def execute(self, input: CandidateResolutionInput) -> CandidateResolutionOutput:
        bundle = _build_prompt(input)
        llm_config = LLMConfig(enable_grounding=False, enable_thinking=False)
        accumulated = ""

        async for chunk in self._llm.generate(bundle, llm_config):
            if chunk.is_done:
                break
            if not chunk.is_thought and chunk.text:
                accumulated += chunk.text

        json_text = _extract_json_object(accumulated)
        if not json_text:
            logger.warning("candidate resolution returned no JSON", extra={"trace_id": input.trace_id})
            return CandidateResolutionOutput(candidates=[])

        try:
            parsed = json.loads(json_text)
            output = CandidateResolutionOutput(**parsed)
        except (json.JSONDecodeError, ValidationError):
            logger.exception("candidate resolution returned invalid JSON", extra={"trace_id": input.trace_id})
            return CandidateResolutionOutput(candidates=[])

        visible_node_ids = {node.node_id for node in input.nodes}
        visible_labels = {node.node_id: node.title for node in input.nodes}
        candidates: list[CandidateNode] = []
        seen = set()
        for candidate in output.candidates:
            if candidate.node_id not in visible_node_ids or candidate.node_id in seen:
                continue
            seen.add(candidate.node_id)
            candidates.append(
                CandidateNode(
                    node_id=candidate.node_id,
                    label=candidate.label or visible_labels.get(candidate.node_id, candidate.node_id),
                    reason=candidate.reason,
                )
            )
            if len(candidates) >= input.max_candidates:
                break

        return CandidateResolutionOutput(candidates=candidates)
