"""Tests for domain models — Pydantic validation."""

import pytest
from app.domain.models import (
    RunActInput,
    PatchOp,
    RunActEvent,
    LLMChunk,
    PromptBundle,
    LLMConfig,
    ErrorInfo,
)


class TestRunActInput:
    def test_minimal_valid(self):
        inp = RunActInput(
            trace_id="t1",
            uid="u1",
            topic_id="topic-1",
            workspace_id="ws-1",
            request_id="r1",
            user_message="hello",
        )
        assert inp.act_type == "ACT_TYPE_EXPLORE"
        assert inp.context_node_ids == []
        assert inp.llm_config is None

    def test_full_fields(self):
        inp = RunActInput(
            trace_id="t2",
            uid="u2",
            topic_id="topic-2",
            workspace_id="ws-2",
            request_id="r2",
            act_type="ACT_TYPE_CONSULT",
            user_message="deeper question",
            anchor_node_id="node-a",
            context_node_ids=["node-b", "node-c"],
            llm_config=LLMConfig(model="gemini-2.0-flash", enable_thinking=True),
        )
        assert inp.anchor_node_id == "node-a"
        assert len(inp.context_node_ids) == 2
        assert inp.llm_config.enable_thinking is True


class TestPatchOp:
    def test_upsert(self):
        op = PatchOp(op="upsert", node_id="n1", content="hello")
        assert op.op == "upsert"

    def test_append_md(self):
        op = PatchOp(op="append_md", node_id="n1", content=" world")
        assert op.op == "append_md"


class TestRunActEvent:
    def test_patch_ops_event(self):
        event = RunActEvent(
            type="patch_ops",
            ops=[PatchOp(op="upsert", node_id="n1", content="x")],
        )
        assert event.type == "patch_ops"
        assert len(event.ops) == 1

    def test_text_delta_event(self):
        event = RunActEvent(type="text_delta", text="hello", is_thought=False)
        assert event.text == "hello"

    def test_terminal_done(self):
        event = RunActEvent(type="terminal", done=True)
        assert event.done is True
        assert event.error is None

    def test_terminal_error(self):
        event = RunActEvent(
            type="terminal",
            error=ErrorInfo(
                code="UNAVAILABLE",
                message="failed",
                retryable=True,
                stage="GENERATE_WITH_MODEL",
                trace_id="t1",
            ),
        )
        assert event.error.retryable is True

    def test_json_excludes_none(self):
        event = RunActEvent(type="terminal", done=True)
        json_str = event.model_dump_json(exclude_none=True)
        assert "ops" not in json_str
        assert "text" not in json_str
        assert '"done":true' in json_str


class TestLLMChunk:
    def test_defaults(self):
        chunk = LLMChunk()
        assert chunk.text == ""
        assert chunk.is_thought is False
        assert chunk.is_done is False


class TestPromptBundle:
    def test_defaults(self):
        bundle = PromptBundle()
        assert bundle.system_instruction == ""
        assert bundle.user_prompt == ""
        assert bundle.context_blocks == []
