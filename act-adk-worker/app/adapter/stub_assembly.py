"""Stub Context Assembly adapter.

Returns a minimal PromptBundle with just the user message.
Future: read from Firestore/GCS to build full context.
"""

from __future__ import annotations

from app.domain.models import PromptBundle, SelectedNodeContext, WorkerMedia
from app.domain.act_prompt_policy import build_act_system_instruction


class StubAssembly:
    """Stub assembly — no external reads, just wraps the user message."""

    async def assemble(
        self,
        topic_id: str,
        workspace_id: str,
        anchor_node_id: str | None,
        context_node_ids: list[str],
        selected_node_contexts: list[SelectedNodeContext],
        user_message: str,
        user_media: list[WorkerMedia] = [],
    ) -> PromptBundle:
        return PromptBundle(
            system_instruction=build_act_system_instruction(user_message),
            user_prompt=user_message,
            user_media=user_media,
            context_blocks=[],
        )
