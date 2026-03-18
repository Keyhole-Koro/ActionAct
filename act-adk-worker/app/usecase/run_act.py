"""RunAct usecase — hybrid pipeline: FirestoreAssembly + optional Discord supplement."""
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


class RunActUsecase:
    """
    Hybrid pipeline:
      1. FirestoreAssembly builds structured context from the knowledge graph (primary).
      2. When discord_store is present, Gemini can call Discord tools at query time
         to supplement with raw conversation context when the knowledge graph is thin.
    """

    def __init__(self, assembly: AssemblyPort, llm: LLMPort, discord_store=None):
        self._assembly = assembly
        self._llm = llm
        self._discord_store = discord_store

    async def _exec_discord_tool(self, fn_name: str, fn_args: dict, workspace_id: str):
        """Execute a Discord tool call on behalf of Gemini (all DiscordStore methods are sync)."""
        if fn_name == "list_discord_structure":
            return self._discord_store.list_structure(workspace_id)
        if fn_name == "read_discord_messages":
            return self._discord_store.read_messages(
                workspace_id,
                channel_id=fn_args.get("channel_id"),
                thread_id=fn_args.get("thread_id"),
                limit=int(fn_args.get("limit", 100)),
            )
        if fn_name == "search_discord_messages":
            return self._discord_store.search_messages(
                workspace_id,
                query=fn_args["query"],
                channel_id=fn_args.get("channel_id"),
                thread_id=fn_args.get("thread_id"),
                limit=int(fn_args.get("limit", 50)),
            )
        return {"error": f"Unknown tool: {fn_name}"}

    async def execute(self, input: RunActInput) -> AsyncIterator[RunActEvent]:
        node_id = input.anchor_node_id or f"act-{uuid.uuid4().hex[:8]}"
        llm_config = input.llm_config or LLMConfig()

        yield RunActEvent(
            type="patch_ops",
            ops=[PatchOp(op="upsert", node_id=node_id, content="")],
        )

        # ── Step 1: FirestoreAssembly (primary — structured knowledge graph) ──
        bundle = None
        assembly_error = None
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
            logger.info(
                "Assembly complete topic=%s context_blocks=%d",
                input.topic_id,
                len(bundle.context_blocks),
            )
        except Exception as e:
            assembly_error = e
            logger.warning("Assembly failed (will use Discord fallback): %s", e)

        # ── Step 2: Choose generation path ───────────────────────────────────
        if self._discord_store is not None:
            # Build system instruction: include structured context if assembly succeeded
            if bundle and bundle.context_blocks:
                context_text = "\n\n---\n\n".join(bundle.context_blocks)
                system_instruction = (
                    "You are a helpful assistant. "
                    f"The following structured knowledge is available:\n\n{context_text}\n\n"
                    "You also have Discord tools to look up raw conversation history "
                    "when the structured knowledge above is insufficient."
                )
            else:
                system_instruction = (
                    "You are a helpful assistant. "
                    "Use the provided Discord tools to find relevant information. "
                    "Start by calling list_discord_structure to see available channels and threads."
                )

            logger.info(
                "Using hybrid Discord+Assembly path workspace=%s assembly_ok=%s",
                input.workspace_id,
                assembly_error is None,
            )

            try:
                accumulated = ""
                seq = 0
                async for chunk in self._llm.generate_with_discord_tools(
                    user_message=input.user_message,
                    system_instruction=system_instruction,
                    workspace_id=input.workspace_id,
                    tool_executor=self._exec_discord_tool,
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
                logger.exception("Hybrid LLM generation failed")
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
                used_tools=["assembly", "discord_store", "llm.generate_with_discord_tools"],
                used_sources=[],
                used_context_node_ids=input.context_node_ids,
                used_selected_node_contexts=input.selected_node_contexts,
            )
            return

        # ── Legacy path: assembly only (no discord_store) ─────────────────────
        if assembly_error is not None:
            yield RunActEvent(
                type="terminal",
                error=ErrorInfo(
                    code="UNAVAILABLE",
                    message=str(assembly_error),
                    retryable=True,
                    stage="ASSEMBLY_RETRIEVE",
                    trace_id=input.trace_id,
                ),
            )
            return

        accumulated = ""
        seq = 0
        try:
            async for chunk in self._llm.generate(bundle, llm_config):
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

        used_sources: list[SourceRef] = []
        for nid in input.context_node_ids:
            used_sources.append(SourceRef(id=nid, kind="context_node", label=nid))
        for node in input.selected_node_contexts:
            used_sources.append(SourceRef(
                id=node.node_id, kind=node.kind or "selected_node",
                label=node.label or node.node_id, uri="",
            ))

        yield RunActEvent(
            type="terminal",
            done=True,
            used_context_node_ids=input.context_node_ids,
            used_selected_node_contexts=input.selected_node_contexts,
            used_tools=["assembly", "llm.generate"],
            used_sources=used_sources,
        )
