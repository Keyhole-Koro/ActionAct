"""DecideActAction usecase — lightweight LLM decision before RunAct."""

from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from app.domain.models import (
    ActDecisionCandidate,
    ActDecisionInput,
    ActDecisionOutput,
    LLMConfig,
    PromptBundle,
    PromptDebugInfo,
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


def _truncate(text: str, limit: int = 180) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3] + "..."


def _contains_japanese(text: str) -> bool:
    return any("\u3040" <= char <= "\u30ff" or "\u4e00" <= char <= "\u9fff" for char in text)


def _default_message(action: str, user_message: str) -> str:
    if _contains_japanese(user_message):
        if action == "choose_candidate":
            return "どのノードを指しているか選んでください。"
        return "対象のノードを選んでからもう一度試してください。"
    if action == "choose_candidate":
        return "Pick the node you meant."
    return "Select the node you meant and try again."


def _build_prompt(input: ActDecisionInput) -> PromptBundle:
    system_instruction = (
        "ACT_DECISION_JSON\n"
        "You decide the next action before RunAct starts.\n"
        "Return JSON only.\n"
        "Schema:\n"
        '{'
        '"action":"run|clarify|choose_candidate",'
        '"message":"string|null",'
        '"suggested_action":"select_node|retry_without_context|none|null",'
        '"context_node_ids":["string"],'
        '"candidates":[{"node_id":"string","label":"string","reason":"string"}]'
        '}\n'
        "Rules:\n"
        "- If the query does not need UI context, return action=run with context_node_ids=[].\n"
        "- If selected or active nodes clearly satisfy the reference, return action=run with those node ids.\n"
        "- If the query is ambiguous and multiple visible nodes fit, return action=choose_candidate.\n"
        "- If UI context is required but cannot be resolved from available nodes, return action=clarify.\n"
        "- Use only node_id values that appear in the provided visible graph.\n"
        "- Return at most 4 candidates.\n"
        "- Keep messages short and action-oriented.\n"
    )

    visible_nodes = [
        json.dumps(
            {
                "node_id": node.node_id,
                "title": node.title,
                "content_md": _truncate(node.content_md or ""),
                "selected": node.selected,
                "source": node.source,
            },
            ensure_ascii=False,
        )
        for node in input.nodes
    ]

    user_prompt = (
        f"user_message: {input.user_message}\n"
        f"active_node_id: {input.active_node_id or ''}\n"
        f"selected_node_ids: {input.selected_node_ids}\n"
        f"available_tools: {input.available_tools}\n"
        "visible_graph_nodes:\n"
        + "\n".join(visible_nodes)
    )
    return PromptBundle(system_instruction=system_instruction, user_prompt=user_prompt, context_blocks=[])


def _validate_context_node_ids(input: ActDecisionInput, context_node_ids: list[str]) -> list[str]:
    visible_node_ids = {node.node_id for node in input.nodes}
    ordered: list[str] = []
    seen: set[str] = set()
    for node_id in context_node_ids:
        normalized = node_id.strip()
        if not normalized or normalized in seen or normalized not in visible_node_ids:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def _validate_candidates(input: ActDecisionInput, candidates: list[ActDecisionCandidate]) -> list[ActDecisionCandidate]:
    visible_labels = {node.node_id: node.title for node in input.nodes}
    validated: list[ActDecisionCandidate] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate.node_id not in visible_labels or candidate.node_id in seen:
            continue
        seen.add(candidate.node_id)
        validated.append(
            ActDecisionCandidate(
                node_id=candidate.node_id,
                label=candidate.label or visible_labels[candidate.node_id],
                reason=candidate.reason,
            )
        )
        if len(validated) >= 4:
            break
    return validated


class DecideActActionUsecase:
    def __init__(self, llm: LLMPort):
        self._llm = llm

    async def execute(self, input: ActDecisionInput) -> ActDecisionOutput:
        bundle = _build_prompt(input)
        debug_prompt = PromptDebugInfo(
            system_instruction=bundle.system_instruction,
            user_prompt=bundle.user_prompt,
            context_blocks=bundle.context_blocks,
        )
        llm_config = LLMConfig(enable_grounding=False, enable_thinking=False)
        accumulated = ""

        async for chunk in self._llm.generate(bundle, llm_config):
            if chunk.is_done:
                break
            if not chunk.is_thought and chunk.text:
                accumulated += chunk.text

        json_text = _extract_json_object(accumulated)
        if not json_text:
            logger.warning("act decision returned no JSON", extra={"trace_id": input.trace_id})
            return ActDecisionOutput(action="run", context_node_ids=[], debug_prompt=debug_prompt)

        try:
            parsed = json.loads(json_text)
            output = ActDecisionOutput(**parsed)
        except (json.JSONDecodeError, ValidationError):
            logger.exception("act decision returned invalid JSON", extra={"trace_id": input.trace_id})
            return ActDecisionOutput(action="run", context_node_ids=[], debug_prompt=debug_prompt)

        context_node_ids = _validate_context_node_ids(input, output.context_node_ids)
        candidates = _validate_candidates(input, output.candidates)

        if output.action == "run":
            return ActDecisionOutput(action="run", context_node_ids=context_node_ids, debug_prompt=debug_prompt)

        if output.action == "choose_candidate":
            if not candidates:
                return ActDecisionOutput(
                    action="clarify",
                    message=_default_message("clarify", input.user_message),
                    suggested_action="select_node",
                    context_node_ids=[],
                    debug_prompt=debug_prompt,
                )
            return ActDecisionOutput(
                action="choose_candidate",
                message=output.message or _default_message("choose_candidate", input.user_message),
                suggested_action="select_node",
                context_node_ids=[],
                candidates=candidates,
                debug_prompt=debug_prompt,
            )

        return ActDecisionOutput(
            action="clarify",
            message=output.message or _default_message("clarify", input.user_message),
            suggested_action=output.suggested_action or "select_node",
            context_node_ids=[],
            debug_prompt=debug_prompt,
        )
