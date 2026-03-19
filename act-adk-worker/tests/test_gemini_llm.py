"""Tests for GeminiLLM adapter."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.adapter.gemini_llm import GeminiLLM
from app.domain.models import LLMConfig, PromptBundle


class _FakeAsyncStream:
    def __init__(self, responses):
        self._responses = responses

    def __aiter__(self):
        self._iter = iter(self._responses)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeModels:
    def __init__(self):
        self.calls = []

    async def generate_content_stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeAsyncStream([
            SimpleNamespace(text="hello "),
            SimpleNamespace(text="world"),
            SimpleNamespace(text=""),
        ])


class _FakeAioClient:
    def __init__(self):
        self.models = _FakeModels()


@pytest.mark.asyncio
async def test_gemini_llm_awaits_async_stream_before_iteration():
    llm = GeminiLLM(project="local-dev", api_key="test-key")
    fake_aio = _FakeAioClient()
    llm._client = SimpleNamespace(aio=fake_aio)

    chunks = []
    async for chunk in llm.generate(
        PromptBundle(user_prompt="test question"),
        LLMConfig(),
    ):
        chunks.append(chunk)

    assert [chunk.text for chunk in chunks[:-1]] == ["hello ", "world"]
    assert chunks[-1].is_done is True
    assert fake_aio.models.calls[0]["config"].tools is None


@pytest.mark.asyncio
async def test_gemini_llm_enables_google_search_tool_for_grounding():
    llm = GeminiLLM(project="local-dev", api_key="test-key")
    fake_aio = _FakeAioClient()
    llm._client = SimpleNamespace(aio=fake_aio)

    async for _ in llm.generate(
        PromptBundle(user_prompt="latest AI news"),
        LLMConfig(enable_grounding=True),
    ):
        pass

    config = fake_aio.models.calls[0]["config"]
    assert config.tools is not None
    assert config.model_dump(by_alias=True, exclude_none=True)["tools"] == [{"googleSearch": {}}]


@pytest.mark.asyncio
async def test_gemini_llm_enables_thinking_config():
    llm = GeminiLLM(project="local-dev", api_key="test-key")
    fake_aio = _FakeAioClient()
    llm._client = SimpleNamespace(aio=fake_aio)

    async for _ in llm.generate(
        PromptBundle(user_prompt="reason step by step"),
        LLMConfig(enable_thinking=True),
    ):
        pass

    config = fake_aio.models.calls[0]["config"]
    assert config.model_dump(by_alias=True, exclude_none=True)["thinkingConfig"]["includeThoughts"] is True


@pytest.mark.asyncio
async def test_gemini_llm_keeps_context_out_of_user_turn():
    llm = GeminiLLM(project="local-dev", api_key="test-key")
    fake_aio = _FakeAioClient()
    llm._client = SimpleNamespace(aio=fake_aio)

    async for _ in llm.generate(
        PromptBundle(
            system_instruction="You are helpful.",
            user_prompt="Tell me about Windows",
            context_blocks=["## Topic\n- title: AWS", "## Focus Nodes\n- AWS basics"],
        ),
        LLMConfig(),
    ):
        pass

    call = fake_aio.models.calls[0]
    contents = call["contents"]
    assert len(contents) == 1
    assert contents[0].role == "user"
    assert contents[0].parts[0].text == "Tell me about Windows"

    system_instruction = call["config"].system_instruction
    assert system_instruction is not None
    assert "supporting material" in system_instruction
    assert "AWS" in system_instruction
    assert "You are helpful." in system_instruction
