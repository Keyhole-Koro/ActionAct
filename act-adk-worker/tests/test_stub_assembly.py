"""Tests for stub assembly adapter."""

import pytest

from app.adapter.stub_assembly import StubAssembly


@pytest.mark.asyncio
async def test_stub_assembly_returns_bundle():
    asm = StubAssembly()
    bundle = await asm.assemble(
        topic_id="t1",
        workspace_id="ws-1",
        anchor_node_id=None,
        context_node_ids=[],
        user_message="hello world",
    )

    assert bundle.user_prompt == "hello world"
    assert bundle.system_instruction != ""
    assert bundle.context_blocks == []


@pytest.mark.asyncio
async def test_stub_assembly_preserves_user_message():
    asm = StubAssembly()
    msg = "Tell me about quantum mechanics"
    bundle = await asm.assemble("t1", "ws-1", None, [], msg)
    assert bundle.user_prompt == msg
