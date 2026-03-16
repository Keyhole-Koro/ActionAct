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

    def __init__(self, assembly: AssemblyPort, llm: LLMPort):
        self._assembly = assembly
        self._llm = llm

    async def execute(self, input: RunActInput) -> AsyncIterator[RunActEvent]:
        node_id = input.anchor_node_id or f"act-{uuid.uuid4().hex[:8]}"
        llm_config = input.llm_config or LLMConfig()

        # 1. Context Assembly
        try:
            bundle = await self._assembly.assemble(
                topic_id=input.topic_id,
                workspace_id=input.workspace_id,
                anchor_node_id=input.anchor_node_id,
                context_node_ids=input.context_node_ids,
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

        # 3. LLM Generate → stream as text_delta + append_md
        accumulated = ""
        seq = 0
        try:
            async for chunk in self._llm.generate(bundle, llm_config):
                if chunk.is_done:
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

        # 4. Terminal done
        yield RunActEvent(type="terminal", done=True)
