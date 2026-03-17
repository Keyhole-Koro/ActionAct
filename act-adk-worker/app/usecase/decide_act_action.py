"""DecideActAction usecase — lightweight LLM decision before RunAct."""

from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from app.domain.models import (
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


def _build_prompt(input: ActDecisionInput) -> PromptBundle:
    system_instruction = (
        "ACT_DECISION_JSON\n"
        "You decide the next action before RunAct starts.\n"
        "Return JSON only.\n"
        "Schema:\n"
        '{'
        '"action":"run|choose_candidate",'
        '"message":"string|null",'
        '"context_node_ids":["string"],'
        '"candidates":[{"node_id":"string","label":"string","reason":"string"}]'
        '}\n'
        "Rules:\n"
        "- Prefer action=run by default.\n"
        "- If the query does not need UI context, return action=run with context_node_ids=[].\n"
        "- If selected or active nodes plausibly satisfy the reference, return action=run with those node ids.\n"
        "- Return action=choose_candidate only when disambiguation is truly needed before proceeding.\n"
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
            raise RuntimeError("act decision returned no JSON")

        try:
            parsed = json.loads(json_text)
            output = ActDecisionOutput(**parsed)
        except (json.JSONDecodeError, ValidationError):
            raise RuntimeError("act decision returned invalid JSON")

        return ActDecisionOutput(
            action=output.action,
            message=output.message,
            suggested_action=output.suggested_action,
            context_node_ids=output.context_node_ids,
            candidates=output.candidates,
            debug_prompt=debug_prompt,
        )
