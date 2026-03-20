"""Tests for RunAct usecase with mock ports."""

import pytest

from app.adapter.stub_assembly import StubAssembly
from app.domain.models import LLMChunk, RunActInput
from app.usecase.run_act import RunActUsecase


class FakeLLM:
    async def generate(self, _bundle, _config):
        yield LLMChunk(text="hello ")
        yield LLMChunk(text="world")
        yield LLMChunk(is_done=True)


class FakeLLMStartActMissingAnchor:
    async def generate(self, _bundle, _config):
        yield LLMChunk(
            is_done=True,
            function_calls=[
                {
                    "name": "start_act",
                    "args": {
                        "user_message": "look deeper",
                    },
                }
            ],
        )


class RecordingGroundedLLM:
    def __init__(self):
        self.calls = []

    async def generate(self, bundle, config):
        self.calls.append((bundle, config))
        if len(self.calls) == 1:
            yield LLMChunk(text="grounded summary")
            yield LLMChunk(is_done=True)
            return
        yield LLMChunk(text="final answer")
        yield LLMChunk(
            is_done=True,
            function_calls=[
                {
                    "name": "suggest_deep_dives",
                    "args": {
                        "suggestions": [
                            {"label": "next", "query": "go deeper"},
                        ],
                    },
                }
            ],
        )


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
    uc = RunActUsecase(assembly=StubAssembly(), llm=FakeLLM())

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
    uc = RunActUsecase(assembly=StubAssembly(), llm=FakeLLM())

    events = []
    async for event in uc.execute(_input(anchor_node_id="my-node")):
        events.append(event)

    # First upsert should use the provided anchor_node_id
    assert events[0].ops[0].node_id == "my-node"


@pytest.mark.asyncio
async def test_usecase_generates_node_id_when_no_anchor():
    uc = RunActUsecase(assembly=StubAssembly(), llm=FakeLLM())

    events = []
    async for event in uc.execute(_input()):
        events.append(event)

    node_id = events[0].ops[0].node_id
    assert node_id.startswith("act-")


@pytest.mark.asyncio
async def test_usecase_event_ordering():
    """Verify: upsert comes before any append_md (contract rule)."""
    uc = RunActUsecase(assembly=StubAssembly(), llm=FakeLLM())

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


@pytest.mark.asyncio
async def test_usecase_drops_start_act_without_anchor_node_id():
    uc = RunActUsecase(assembly=StubAssembly(), llm=FakeLLMStartActMissingAnchor())

    events = []
    async for event in uc.execute(_input(anchor_node_id="root-node")):
        events.append(event)

    action_triggers = [event for event in events if event.type == "action_trigger"]
    assert action_triggers == []
    assert events[-1].type == "terminal"
    assert events[-1].done is True


@pytest.mark.asyncio
async def test_usecase_creates_agent_act_node_for_grounding_subflow():
    llm = RecordingGroundedLLM()
    uc = RunActUsecase(assembly=StubAssembly(), llm=llm)

    events = []
    async for event in uc.execute(_input(llm_config={"enable_grounding": True})):
        events.append(event)

    patch_events = [event for event in events if event.type == "patch_ops" and event.ops]
    agent_upserts = [
        event for event in patch_events
        if event.ops[0].op == "upsert" and event.ops[0].kind == "agent_act"
    ]
    assert len(agent_upserts) == 1
    assert agent_upserts[0].ops[0].parent_id == events[0].ops[0].node_id

    terminal = events[-1]
    assert terminal.type == "terminal"
    assert terminal.done is True
    assert "llm.search_subflow" in terminal.used_tools

    assert llm.calls[0][1].enable_grounding is True
    assert llm.calls[0][1].enable_act_tools is False
    assert llm.calls[1][1].enable_grounding is False
    assert llm.calls[1][1].enable_act_tools is True
