"""RunAct usecase — orchestrates Assembly → LLM → Normalize pipeline."""

from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncIterator

from app.domain.models import (
    ActionTrigger,
    LLMConfig,
    PatchOp,
    RunActEvent,
    RunActInput,
    ErrorInfo,
    SourceRef,
)
from app.domain.ports import AssemblyPort, LLMPort

logger = logging.getLogger(__name__)


def _truncate(value: str, limit: int = 240) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3] + "..."


def _bundle_debug_summary(input: RunActInput, *, system_instruction: str, user_prompt: str, context_blocks: list[str]) -> dict[str, object]:
    return {
        "trace_id": input.trace_id,
        "request_id": input.request_id,
        "topic_id": input.topic_id,
        "workspace_id": input.workspace_id,
        "anchor_node_id": input.anchor_node_id,
        "context_node_ids": input.context_node_ids,
        "selected_node_contexts": len(input.selected_node_contexts),
        "user_message": _truncate(input.user_message, 160),
        "system_instruction_preview": _truncate(system_instruction),
        "user_prompt_preview": _truncate(user_prompt, 160),
        "context_block_count": len(context_blocks),
        "context_block_previews": [
            _truncate(block, 240)
            for block in context_blocks[:5]
        ],
    }


def _search_node_id(root_node_id: str) -> str:
    return f"{root_node_id}-search"


def _search_node_label(user_message: str) -> str:
    return f"Search: {_truncate(user_message, 72)}"


def _with_search_context(bundle, search_summary: str):
    summary = search_summary.strip()
    if not summary:
        return bundle
    next_blocks = [
        *bundle.context_blocks,
        "## Search Subflow Findings\n"
        "The following summary was produced by a dedicated search sub-agent. "
        "Use it as supporting material and continue to use function tools when appropriate.\n\n"
        f"{summary}",
    ]
    return bundle.model_copy(update={"context_blocks": next_blocks})


class RunActUsecase:
    """Pipeline: Context Assembly → LLM Generate → Normalize to PatchOps → Yield events."""

    def __init__(self, assembly: AssemblyPort, llm: LLMPort):
        self._assembly = assembly
        self._llm = llm

    async def _run_search_subflow(
        self,
        input: RunActInput,
        root_node_id: str,
        bundle,
        llm_config: LLMConfig,
    ) -> tuple[object, list[RunActEvent]]:
        child_node_id = _search_node_id(root_node_id)
        child_events: list[RunActEvent] = [
            RunActEvent(
                type="patch_ops",
                ops=[
                    PatchOp(
                        op="upsert",
                        node_id=child_node_id,
                        content="",
                        kind="agent_act",
                        parent_id=root_node_id,
                        label=_search_node_label(input.user_message),
                    )
                ],
            ),
            RunActEvent(
                type="patch_ops",
                ops=[
                    PatchOp(
                        op="append_md",
                        node_id=child_node_id,
                        content="Searching and summarizing relevant external information...\n\n",
                        seq=1,
                        expected_offset=0,
                    )
                ],
            ),
        ]

        search_bundle = bundle.model_copy(
            update={
                "system_instruction": (
                    ((bundle.system_instruction + "\n\n") if bundle.system_instruction else "")
                    + "You are a search-focused sub-agent. Use grounding/search to gather timely external context. "
                    "Return a concise markdown summary with the most relevant findings for the parent act."
                ),
            }
        )
        search_config = llm_config.model_copy(
            update={
                "enable_grounding": True,
                "enable_thinking": False,
                "enable_act_tools": False,
            }
        )

        search_text = ""
        seq = 1
        try:
            async for chunk in self._llm.generate(search_bundle, search_config):
                if chunk.is_done:
                    break
                if chunk.is_thought or not chunk.text:
                    continue
                seq += 1
                child_events.append(
                    RunActEvent(
                        type="patch_ops",
                        ops=[
                            PatchOp(
                                op="append_md",
                                node_id=child_node_id,
                                content=chunk.text,
                                seq=seq,
                                expected_offset=len(search_text) + len("Searching and summarizing relevant external information...\n\n"),
                            )
                        ],
                    )
                )
                search_text += chunk.text
        except Exception as exc:
            logger.warning(
                "Search subflow failed; continuing without grounded summary",
                extra={
                    "trace_id": input.trace_id,
                    "request_id": input.request_id,
                },
                exc_info=exc,
            )
            seq += 1
            child_events.append(
                RunActEvent(
                    type="patch_ops",
                    ops=[
                        PatchOp(
                            op="append_md",
                            node_id=child_node_id,
                            content=f"Search subflow failed. Continuing without external findings.\n\nReason: {exc}",
                            seq=seq,
                            expected_offset=len(search_text) + len("Searching and summarizing relevant external information...\n\n"),
                        )
                    ],
                )
            )
            return bundle, child_events

        if not search_text.strip():
            seq += 1
            child_events.append(
                RunActEvent(
                    type="patch_ops",
                    ops=[
                        PatchOp(
                            op="append_md",
                            node_id=child_node_id,
                            content="No additional external findings were returned.\n",
                            seq=seq,
                            expected_offset=len(search_text) + len("Searching and summarizing relevant external information...\n\n"),
                        )
                    ],
                )
            )
            return bundle, child_events

        return _with_search_context(bundle, search_text), child_events

    async def execute(self, input: RunActInput) -> AsyncIterator[RunActEvent]:
        node_id = input.anchor_node_id or f"act-{uuid.uuid4().hex[:8]}"
        llm_config = (input.llm_config or LLMConfig()).model_copy(update={"enable_act_tools": True})

        # 1. Context Assembly
        try:
            bundle = await self._assembly.assemble(
                topic_id=input.topic_id,
                workspace_id=input.workspace_id,
                anchor_node_id=input.anchor_node_id,
                context_node_ids=input.context_node_ids,
                selected_node_contexts=input.selected_node_contexts,
                user_message=input.user_message,
                user_media=input.user_media,
            )
        except Exception as e:
            logger.exception("Assembly failed")
            yield RunActEvent(
                type="terminal",
                error=ErrorInfo(
                    code="UNAVAILABLE",
                    message=str(e),
                    retryable=True,
                    stage="ASSEMBLY_RETRIEVE",
                    trace_id=input.trace_id,
                ),
            )
            return

        logger.info(
            "PromptBundle assembled",
            extra=_bundle_debug_summary(
                input,
                system_instruction=bundle.system_instruction,
                user_prompt=bundle.user_prompt,
                context_blocks=bundle.context_blocks,
            ),
        )

        # 2. Send initial upsert (block must exist before append_md)
        yield RunActEvent(
            type="patch_ops",
            ops=[PatchOp(op="upsert", node_id=node_id, content="")],
        )

        if llm_config.enable_grounding:
            bundle, search_events = await self._run_search_subflow(
                input=input,
                root_node_id=node_id,
                bundle=bundle,
                llm_config=llm_config,
            )
            for event in search_events:
                yield event

        # 3. LLM Generate → stream as text_delta + append_md
        accumulated = ""
        seq = 0
        function_calls: list[dict] = []
        main_llm_config = llm_config.model_copy(
            update={
                "enable_grounding": False,
                "enable_act_tools": True,
            }
        )
        try:
            async for chunk in self._llm.generate(bundle, main_llm_config):
                if chunk.is_done:
                    function_calls = chunk.function_calls
                    break

                # Stream text_delta for live UI
                yield RunActEvent(
                    type="text_delta",
                    text=chunk.text,
                    is_thought=chunk.is_thought,
                )

                # Accumulate answer text (not thoughts) as append_md
                if not chunk.is_thought and chunk.text:
                    seq += 1
                    expected_offset = len(accumulated)
                    yield RunActEvent(
                        type="patch_ops",
                        ops=[PatchOp(
                            op="append_md",
                            node_id=node_id,
                            content=chunk.text,
                            seq=seq,
                            expected_offset=expected_offset,
                        )],
                    )
                    accumulated += chunk.text

        except Exception as e:
            logger.exception("LLM generation failed")
            yield RunActEvent(
                type="terminal",
                error=ErrorInfo(
                    code="UNAVAILABLE",
                    message=str(e),
                    retryable=True,
                    stage="GENERATE_WITH_MODEL",
                    trace_id=input.trace_id,
                ),
            )
            return

        # 3b. Process function calls from the LLM
        for fc in function_calls:
            fc_name = fc.get("name", "")
            fc_args = fc.get("args", {})

            if fc_name == "suggest_deep_dives":
                suggestions = fc_args.get("suggestions", [])
                for i, suggestion in enumerate(suggestions):
                    suggestion_node_id = f"{node_id}-suggest-{i}"
                    yield RunActEvent(
                        type="patch_ops",
                        ops=[PatchOp(
                            op="upsert",
                            node_id=suggestion_node_id,
                            content=suggestion.get("query", ""),
                            kind="suggestion",
                            parent_id=node_id,
                            label=suggestion.get("label", ""),
                        )],
                    )
                logger.info("suggest_deep_dives: %d suggestions yielded", len(suggestions))

            elif fc_name == "start_act":
                anchor_node_id = fc_args.get("anchor_node_id")
                if not isinstance(anchor_node_id, str) or not anchor_node_id.strip():
                    logger.warning(
                        "start_act dropped because anchor_node_id is missing",
                        extra={
                            "trace_id": input.trace_id,
                            "request_id": input.request_id,
                            "user_message": fc_args.get("user_message", ""),
                        },
                    )
                    continue
                yield RunActEvent(
                    type="action_trigger",
                    action_triggers=[ActionTrigger(
                        action="start_act",
                        payload_json=json.dumps(fc_args, ensure_ascii=False),
                    )],
                )
                logger.info("start_act triggered: %s", fc_args.get("user_message", "")[:80])

        # 4. Terminal done with trace metadata for frontend visibility.
        used_tools = ["assembly", "llm.generate"]
        if llm_config.enable_grounding:
            used_tools.append("llm.search_subflow")
        used_sources: list[SourceRef] = []
        for node_id in input.context_node_ids:
            used_sources.append(SourceRef(id=node_id, kind="context_node", label=node_id))
        for node in input.selected_node_contexts:
            used_sources.append(
                SourceRef(
                    id=node.node_id,
                    kind=node.kind or "selected_node",
                    label=node.label or node.node_id,
                    uri="",
                )
            )

        yield RunActEvent(
            type="terminal",
            done=True,
            used_context_node_ids=input.context_node_ids,
            used_selected_node_contexts=input.selected_node_contexts,
            used_tools=used_tools,
            used_sources=used_sources,
        )
