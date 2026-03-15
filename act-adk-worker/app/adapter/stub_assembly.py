"""Stub Context Assembly adapter.

Returns a minimal PromptBundle with just the user message.
Future: read from Firestore/GCS to build full context.
"""

from __future__ import annotations

from app.domain.models import PromptBundle
from app.domain.act_prompt_policy import build_act_system_instruction


class StubAssembly:
    """Stub assembly — no external reads, just wraps the user message."""

    async def assemble(
        self,
        topic_id: str,
        workspace_id: str,
        anchor_node_id: str | None,
        context_node_ids: list[str],
        user_message: str,
    ) -> PromptBundle:
        return PromptBundle(
            system_instruction=build_act_system_instruction(user_message),
            user_prompt=user_message,
            context_blocks=[],
        )
