"""RunAct usecase — orchestrates Assembly → LLM → Normalize pipeline."""

from __future__ import annotations

import logging
import uuid
from typing import AsyncIterator

from app.domain.models import (
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


class RunActUsecase:
    """Pipeline: Context Assembly → LLM Generate → Normalize to PatchOps → Yield events."""

    def __init__(self, assembly: AssemblyPort, llm: LLMPort, discord_store=None):
        self._assembly = assembly
        self._llm = llm
        self._discord_store = discord_store

    async def _discord_tool_executor(self, fn_name: str, fn_args: dict, workspace_id: str):
        """Execute Discord tool calls on behalf of Gemini."""
        if fn_name == "list_discord_structure":
            return await self._discord_store.list_structure(workspace_id)
        elif fn_name == "read_discord_messages":
            return await self._discord_store.read_messages(
                workspace_id,
                channel_id=fn_args.get("channel_id"),
                thread_id=fn_args.get("thread_id"),
                limit=int(fn_args.get("limit", 100)),
            )
        elif fn_name == "search_discord_messages":
            return await self._discord_store.search_messages(
                workspace_id,
                query=fn_args["query"],
                channel_id=fn_args.get("channel_id"),
                thread_id=fn_args.get("thread_id"),
                limit=int(fn_args.get("limit", 50)),
            )
        else:
            return {"error": f"Unknown tool: {fn_name}"}

    async def execute(self, input: RunActInput) -> AsyncIterator[RunActEvent]:
        node_id = input.anchor_node_id or f"act-{uuid.uuid4().hex[:8]}"
        llm_config = input.llm_config or LLMConfig()

        # 2. Send initial upsert (block must exist before append_md)
        yield RunActEvent(
            type="patch_ops",
            ops=[PatchOp(op="upsert", node_id=node_id, content="")],
        )

        # ── Discord agentic path ─────────────────────────────────────────────
        if self._discord_store is not None:
            system_instruction = (
                "You are a helpful assistant. "
                "You have access to Discord messages stored in this workspace. "
                "Use the provided tools to find relevant information and answer the user's question. "
                "Always check the Discord structure first, then read or search relevant channels/threads."
            )
            logger.info("Using Discord agentic RAG for workspace=%s", input.workspace_id)
            try:
                accumulated = ""
                seq = 0
                async for chunk in self._llm.generate_with_discord_tools(
                    user_message=input.user_message,
                    system_instruction=system_instruction,
                    workspace_id=input.workspace_id,
                    tool_executor=self._discord_tool_executor,
                    config=llm_config,
                ):
                    if chunk.is_done:
                        break
                    yield RunActEvent(type="text_delta", text=chunk.text, is_thought=chunk.is_thought)
                    if not chunk.is_thought and chunk.text:
                        seq += 1
                        yield RunActEvent(
                            type="patch_ops",
                            ops=[PatchOp(
                                op="append_md",
                                node_id=node_id,
                                content=chunk.text,
                                seq=seq,
                                expected_offset=len(accumulated),
                            )],
                        )
                        accumulated += chunk.text
            except Exception as e:
                logger.exception("Discord agentic LLM failed")
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

            yield RunActEvent(
                type="terminal",
                done=True,
                used_tools=["discord_store", "llm.generate_with_discord_tools"],
                used_sources=[],
                used_context_node_ids=[],
                used_selected_node_contexts=[],
            )
            return

        # ── Legacy Assembly path ─────────────────────────────────────────────
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

        accumulated = ""
        seq = 0
        try:
            async for chunk in self._llm.generate(bundle, llm_config):
                if chunk.is_done:
                    break

                yield RunActEvent(
                    type="text_delta",
                    text=chunk.text,
                    is_thought=chunk.is_thought,
                )

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

        used_tools = ["assembly", "llm.generate"]
        used_sources: list[SourceRef] = []
        for nid in input.context_node_ids:
            used_sources.append(SourceRef(id=nid, kind="context_node", label=nid))
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
