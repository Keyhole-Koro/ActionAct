"""Domain models — Pydantic DTOs for the act-adk-worker pipeline."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Inbound (from act-api) ──


class LLMConfig(BaseModel):
    model: str = "gemini-2.0-flash"
    enable_grounding: bool = False
    enable_thinking: bool = False


class RunActInput(BaseModel):
    """JSON body sent by act-api to POST /run_act."""

    trace_id: str
    uid: str
    topic_id: str
    workspace_id: str
    request_id: str
    act_type: str = "ACT_TYPE_EXPLORE"
    user_message: str
    anchor_node_id: Optional[str] = None
    context_node_ids: list[str] = Field(default_factory=list)
    llm_config: Optional[LLMConfig] = None


# ── Internal ──


class PromptBundle(BaseModel):
    """Output of Context Assembly — the constructed prompt for the LLM."""

    system_instruction: str = ""
    user_prompt: str = ""
    context_blocks: list[str] = Field(default_factory=list)


class LLMChunk(BaseModel):
    """A single chunk yielded by the LLM during streaming."""

    text: str = ""
    is_thought: bool = False
    is_done: bool = False


# ── Outbound (SSE events back to act-api) ──


class PatchOp(BaseModel):
    op: str  # "upsert" or "append_md"
    node_id: str
    content: str


class ErrorInfo(BaseModel):
    code: str
    message: str
    retryable: bool = False
    stage: str = ""
    trace_id: str = ""
    retry_after_ms: int = 0


class RunActEvent(BaseModel):
    """A single SSE event line sent back to act-api as ndjson."""

    type: str  # "patch_ops" | "text_delta" | "terminal"
    # patch_ops
    ops: Optional[list[PatchOp]] = None
    # text_delta
    text: Optional[str] = None
    is_thought: Optional[bool] = None
    # terminal
    done: Optional[bool] = None
    error: Optional[ErrorInfo] = None
