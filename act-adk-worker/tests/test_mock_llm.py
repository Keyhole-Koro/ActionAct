"""Tests for mock LLM adapter."""

import pytest
import pytest_asyncio

from app.adapter.mock_llm import MockLLM
from app.domain.models import LLMConfig, PromptBundle


@pytest.mark.asyncio
async def test_mock_llm_generates_answer():
    llm = MockLLM()
    bundle = PromptBundle(user_prompt="test question")
    config = LLMConfig()

    chunks = []
    async for chunk in llm.generate(bundle, config):
        chunks.append(chunk)

    # Should have answer chunks + final done chunk
    assert len(chunks) > 1
    assert chunks[-1].is_done is True

    # No thought chunks when thinking is disabled
    thought_chunks = [c for c in chunks if c.is_thought]
    assert len(thought_chunks) == 0


@pytest.mark.asyncio
async def test_mock_llm_with_thinking():
    llm = MockLLM()
    bundle = PromptBundle(user_prompt="deep question")
    config = LLMConfig(enable_thinking=True)

    chunks = []
    async for chunk in llm.generate(bundle, config):
        chunks.append(chunk)

    thought_chunks = [c for c in chunks if c.is_thought]
    answer_chunks = [c for c in chunks if not c.is_thought and not c.is_done]

    assert len(thought_chunks) > 0, "should have thinking chunks"
    assert len(answer_chunks) > 0, "should have answer chunks"
    assert chunks[-1].is_done is True


@pytest.mark.asyncio
async def test_mock_llm_includes_user_prompt():
    llm = MockLLM()
    bundle = PromptBundle(user_prompt="quantum computing")
    config = LLMConfig()

    all_text = ""
    async for chunk in llm.generate(bundle, config):
        all_text += chunk.text

    assert "quantum computing" in all_text
