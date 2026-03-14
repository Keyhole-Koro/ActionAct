"""Mock LLM adapter — used when VERTEX_USE_REAL_API=false."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

from app.domain.models import LLMChunk, LLMConfig, PromptBundle


class MockLLM:
    """Streams fake LLM responses for local development."""

    async def generate(
        self,
        bundle: PromptBundle,
        config: LLMConfig,
    ) -> AsyncIterator[LLMChunk]:
        # Simulate a thinking phase
        if config.enable_thinking:
            thinking_chunks = [
                "Let me analyze ",
                "the user's request... ",
                "I'll explore the topic ",
                "from multiple angles.",
            ]
            for chunk in thinking_chunks:
                await asyncio.sleep(0.1)
                yield LLMChunk(text=chunk, is_thought=True)

        # Simulate answer generation
        answer_parts = [
            f"## Response to: {bundle.user_prompt}\n\n",
            "Based on the context provided, ",
            "here are the key findings:\n\n",
            "1. **First insight**: The topic shows ",
            "interesting patterns that merit further exploration.\n\n",
            "2. **Second insight**: There are connections ",
            "to related concepts in the knowledge base.\n\n",
            "3. **Conclusion**: Further investigation ",
            "would help strengthen the understanding.\n",
        ]
        for part in answer_parts:
            await asyncio.sleep(0.08)
            yield LLMChunk(text=part, is_thought=False)

        yield LLMChunk(text="", is_done=True)
