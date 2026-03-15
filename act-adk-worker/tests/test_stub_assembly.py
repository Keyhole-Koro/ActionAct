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
    assert "既定の応答は短く" in bundle.system_instruction


@pytest.mark.asyncio
async def test_stub_assembly_preserves_user_message():
    asm = StubAssembly()
    msg = "Tell me about quantum mechanics"
    bundle = await asm.assemble("t1", "ws-1", None, [], msg)
    assert bundle.user_prompt == msg
    assert "回答は英語" in bundle.system_instruction
    assert "儀礼的前置きは不要" in bundle.system_instruction


@pytest.mark.asyncio
async def test_stub_assembly_sets_japanese_response_policy_for_japanese_prompt():
    asm = StubAssembly()
    bundle = await asm.assemble("t1", "ws-1", None, [], "日本語で説明して")
    assert "回答は日本語" in bundle.system_instruction
