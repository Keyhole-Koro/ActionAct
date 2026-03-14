"""Tests for RunAct usecase with mock ports."""

import pytest

from app.adapter.mock_llm import MockLLM
from app.adapter.stub_assembly import StubAssembly
from app.domain.models import RunActInput
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


@pytest.mark.asyncio
async def test_usecase_happy_path():
    uc = RunActUsecase(assembly=StubAssembly(), llm=MockLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    # First event should be upsert
    assert events[0].type == "patch_ops"
    assert events[0].ops[0].op == "upsert"

    # Last event should be terminal done
    assert events[-1].type == "terminal"
    assert events[-1].done is True

    # Should have text_delta events in between
    text_deltas = [e for e in events if e.type == "text_delta"]
    assert len(text_deltas) > 0

    # Should have append_md patch_ops
    append_ops = [
        e for e in events
        if e.type == "patch_ops" and e.ops and e.ops[0].op == "append_md"
    ]
    assert len(append_ops) > 0


@pytest.mark.asyncio
async def test_usecase_uses_anchor_node_id():
    uc = RunActUsecase(assembly=StubAssembly(), llm=MockLLM())

    events = []
    async for event in uc.execute(_input(anchor_node_id="my-node")):
        events.append(event)

    # First upsert should use the provided anchor_node_id
    assert events[0].ops[0].node_id == "my-node"


@pytest.mark.asyncio
async def test_usecase_generates_node_id_when_no_anchor():
    uc = RunActUsecase(assembly=StubAssembly(), llm=MockLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    node_id = events[0].ops[0].node_id
    assert node_id.startswith("act-")


@pytest.mark.asyncio
async def test_usecase_event_ordering():
    """Verify: upsert comes before any append_md (contract rule)."""
    uc = RunActUsecase(assembly=StubAssembly(), llm=MockLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    first_upsert_idx = None
    first_append_idx = None

    for i, e in enumerate(events):
        if e.type == "patch_ops" and e.ops:
            if e.ops[0].op == "upsert" and first_upsert_idx is None:
                first_upsert_idx = i
            if e.ops[0].op == "append_md" and first_append_idx is None:
                first_append_idx = i

    assert first_upsert_idx is not None, "should have upsert"
    assert first_append_idx is not None, "should have append_md"
    assert first_upsert_idx < first_append_idx, "upsert must come before append_md"
