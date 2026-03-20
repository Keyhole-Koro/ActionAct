from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.adapter.discord_tools import run_discord_agentic_loop
from app.domain.models import LLMConfig


class _FakeModels:
    def __init__(self):
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            candidates=[
                SimpleNamespace(
                    content=SimpleNamespace(
                        parts=[SimpleNamespace(function_call=None, text="done")]
                    )
                )
            ]
        )


class _FakeAioClient:
    def __init__(self):
        self.models = _FakeModels()


async def _noop_tool_executor(name: str, args: dict, workspace_id: str) -> object:
    return {"ok": True}


@pytest.mark.asyncio
async def test_discord_loop_resolves_flash_alias_to_supported_model():
    client = SimpleNamespace(aio=_FakeAioClient())

    chunks = []
    async for chunk in run_discord_agentic_loop(
        client=client,
        user_message="hello",
        system_instruction="test",
        workspace_id="ws1",
        tool_executor=_noop_tool_executor,
        config=LLMConfig(model="flash"),
    ):
        chunks.append(chunk)

    assert chunks[-1].is_done is True
    assert client.aio.models.calls[0]["model"] == "gemini-3-flash-preview"
