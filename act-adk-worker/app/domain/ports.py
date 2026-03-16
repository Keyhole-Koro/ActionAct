"""Domain ports — abstract interfaces for infrastructure adapters."""

from __future__ import annotations

from typing import AsyncIterator, Protocol

from app.domain.models import LLMChunk, LLMConfig, PromptBundle, WorkerMedia


class LLMPort(Protocol):
    """Generates text from a prompt bundle, streaming chunks."""

    async def generate(
        self,
        bundle: PromptBundle,
        config: LLMConfig,
    ) -> AsyncIterator[LLMChunk]: ...


class AssemblyPort(Protocol):
    """Assembles context for a given topic into a PromptBundle."""

    async def assemble(
        self,
        topic_id: str,
        workspace_id: str,
        anchor_node_id: str | None,
        context_node_ids: list[str],
        user_message: str,
        user_media: list[WorkerMedia] = [],
    ) -> PromptBundle: ...
