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
    async def generate_content_stream(self, **kwargs):
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
    llm._client = SimpleNamespace(aio=_FakeAioClient())

    chunks = []
    async for chunk in llm.generate(
        PromptBundle(user_prompt="test question"),
        LLMConfig(),
    ):
        chunks.append(chunk)

    assert [chunk.text for chunk in chunks[:-1]] == ["hello ", "world"]
    assert chunks[-1].is_done is True

