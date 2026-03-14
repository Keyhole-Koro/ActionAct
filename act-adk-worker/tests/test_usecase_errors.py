"""Tests for usecase error paths — assembly failure, LLM failure."""

import pytest
from unittest.mock import AsyncMock

from app.domain.models import RunActInput, LLMConfig, PromptBundle, LLMChunk
from app.usecase.run_act import RunActUsecase


def _input(**overrides) -> RunActInput:
    defaults = dict(
        trace_id="t1",
        uid="u1",
        topic_id="topic-1",
        workspace_id="ws-1",
        request_id="r1",
        user_message="hello",
    )
    defaults.update(overrides)
    return RunActInput(**defaults)


class FailingAssembly:
    """Assembly that raises an exception."""
    async def assemble(self, **kwargs):
        raise ConnectionError("Firestore unreachable")


class FailingLLM:
    """LLM that raises mid-stream."""
    async def generate(self, bundle, config):
        yield LLMChunk(text="start...", is_thought=False)
        raise TimeoutError("Vertex AI timed out")


class EmptyLLM:
    """LLM that immediately signals done with no content."""
    async def generate(self, bundle, config):
        yield LLMChunk(text="", is_done=True)


class WorkingAssembly:
    async def assemble(self, **kwargs):
        return PromptBundle(
            system_instruction="test",
            user_prompt=kwargs.get("user_message", "test"),
        )


@pytest.mark.asyncio
async def test_assembly_failure_yields_terminal_error():
    """When assembly fails, should get a terminal error with stage=ASSEMBLY_RETRIEVE."""
    uc = RunActUsecase(assembly=FailingAssembly(), llm=EmptyLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    # Should be exactly 1 event: terminal error
    assert len(events) == 1
    assert events[0].type == "terminal"
    assert events[0].error is not None
    assert events[0].error.stage == "ASSEMBLY_RETRIEVE"
    assert events[0].error.retryable is True
    assert "Firestore unreachable" in events[0].error.message


@pytest.mark.asyncio
async def test_llm_failure_yields_terminal_error():
    """When LLM fails mid-stream, should get partial events then terminal error."""
    uc = RunActUsecase(assembly=WorkingAssembly(), llm=FailingLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    # Should have: upsert, some text_delta/patch_ops, then terminal error
    assert events[0].type == "patch_ops"
    assert events[0].ops[0].op == "upsert"

    # Last event should be terminal error
    last = events[-1]
    assert last.type == "terminal"
    assert last.error is not None
    assert last.error.stage == "GENERATE_WITH_MODEL"
    assert last.error.retryable is True
    assert "timed out" in last.error.message


@pytest.mark.asyncio
async def test_empty_llm_response():
    """When LLM returns nothing (immediate done), should still get upsert + terminal done."""
    uc = RunActUsecase(assembly=WorkingAssembly(), llm=EmptyLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    assert events[0].type == "patch_ops"
    assert events[0].ops[0].op == "upsert"
    assert events[-1].type == "terminal"
    assert events[-1].done is True
    # No text_delta or append_md events
    text_events = [e for e in events if e.type == "text_delta"]
    assert len(text_events) == 0


@pytest.mark.asyncio
async def test_trace_id_propagated_to_error():
    """trace_id from input should appear in error events."""
    uc = RunActUsecase(assembly=FailingAssembly(), llm=EmptyLLM())

    events = []
    async for event in uc.execute(_input(trace_id="my-trace-abc")):
        events.append(event)

    assert events[0].error.trace_id == "my-trace-abc"
