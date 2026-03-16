"""Domain models — Pydantic DTOs for the act-adk-worker pipeline."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Inbound (from act-api) ──


class LLMConfig(BaseModel):
    model: str = "gemini-2.0-flash"
    enable_grounding: bool = False
    enable_thinking: bool = False


class WorkerMedia(BaseModel):
    mime_type: str
    data_base64: str

class RunActInput(BaseModel):
    """JSON body sent by act-api to POST /run_act."""

    trace_id: str
    uid: str
    topic_id: str
    workspace_id: str
    request_id: str
    act_type: str = "ACT_TYPE_EXPLORE"
    user_message: str
    user_media: list[WorkerMedia] = Field(default_factory=list)
    anchor_node_id: Optional[str] = None
    context_node_ids: list[str] = Field(default_factory=list)
    llm_config: Optional[LLMConfig] = None


class CandidateGraphNode(BaseModel):
    node_id: str
    title: str
    content_md: Optional[str] = None
    selected: bool = False
    source: Optional[str] = None


class CandidateResolutionInput(BaseModel):
    trace_id: str
    uid: str
    topic_id: str
    workspace_id: str
    user_message: str
    active_node_id: Optional[str] = None
    selected_node_ids: list[str] = Field(default_factory=list)
    max_candidates: int = 4
    nodes: list[CandidateGraphNode] = Field(default_factory=list)


class ActDecisionInput(BaseModel):
    trace_id: str
    uid: str
    topic_id: str
    workspace_id: str
    user_message: str
    active_node_id: Optional[str] = None
    selected_node_ids: list[str] = Field(default_factory=list)
    available_tools: list[str] = Field(default_factory=list)
    nodes: list[CandidateGraphNode] = Field(default_factory=list)


# ── Internal ──


class PromptBundle(BaseModel):
    """Output of Context Assembly — the constructed prompt for the LLM."""

    system_instruction: str = ""
    user_prompt: str = ""
    user_media: list[WorkerMedia] = Field(default_factory=list)
    context_blocks: list[str] = Field(default_factory=list)


class PromptDebugInfo(BaseModel):
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


class CandidateNode(BaseModel):
    node_id: str
    label: str
    reason: Optional[str] = None


class CandidateResolutionOutput(BaseModel):
    candidates: list[CandidateNode] = Field(default_factory=list)


class ActDecisionCandidate(BaseModel):
    node_id: str
    label: str
    reason: Optional[str] = None


class ActDecisionOutput(BaseModel):
    action: str
    message: Optional[str] = None
    suggested_action: Optional[str] = None
    context_node_ids: list[str] = Field(default_factory=list)
    candidates: list[ActDecisionCandidate] = Field(default_factory=list)
    debug_prompt: Optional[PromptDebugInfo] = None


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
