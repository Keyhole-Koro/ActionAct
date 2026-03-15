"""Stub Context Assembly adapter.

Returns a minimal PromptBundle with just the user message.
Future: read from Firestore/GCS to build full context.
"""

from __future__ import annotations

from app.domain.models import PromptBundle
from app.domain.language_policy import build_language_instruction


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
        system_instruction = (
            "You are an AI research assistant. "
            "Analyze the user's question and provide structured, insightful answers. "
            "Use markdown formatting with headers, lists, and emphasis. "
            f"{build_language_instruction(user_message)}"
        )
        return PromptBundle(
            system_instruction=system_instruction,
            user_prompt=user_message,
            context_blocks=[],
        )
