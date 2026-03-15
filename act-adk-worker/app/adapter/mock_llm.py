"""Mock LLM adapter — used when VERTEX_USE_REAL_API=false."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

from app.domain.models import LLMChunk, LLMConfig, PromptBundle
from app.domain.language_policy import detect_response_language


class MockLLM:
    """Streams fake LLM responses for local development."""

    async def generate(
        self,
        bundle: PromptBundle,
        config: LLMConfig,
    ) -> AsyncIterator[LLMChunk]:
        if "CANDIDATE_SELECTION_JSON" in bundle.system_instruction:
            yield LLMChunk(
                text='{"candidates":[{"node_id":"node-1","label":"Node 1","reason":"Closest visible title match."},{"node_id":"node-2","label":"Node 2","reason":"Another nearby visible candidate."}]}',
                is_thought=False,
            )
            yield LLMChunk(text="", is_done=True)
            return

        response_language = detect_response_language(bundle.user_prompt)
        # Simulate a thinking phase
        if config.enable_thinking:
            if response_language == "ja":
                thinking_chunks = [
                    "質問の意図を整理します。 ",
                    "関連する論点を確認します。 ",
                    "複数の観点から答えを組み立てます。 ",
                ]
            else:
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
        if response_language == "ja":
            answer_parts = [
                f"## 回答対象: {bundle.user_prompt}\n\n",
                "コンテキストを踏まえると、主なポイントは次のとおりです。\n\n",
                "1. **第一の論点**: 重要な観点がいくつかあり、整理して見る価値があります。\n\n",
                "2. **第二の論点**: 知識ベース内の関連ノードとのつながりが見られます。\n\n",
                "3. **結論**: 追加調査を行うと理解をさらに深められます。\n",
            ]
        else:
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
