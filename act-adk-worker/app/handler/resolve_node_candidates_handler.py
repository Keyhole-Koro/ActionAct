"""FastAPI route handler for /resolve_node_candidates."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.domain.models import CandidateResolutionInput
from app.usecase.resolve_node_candidates import ResolveNodeCandidatesUsecase

logger = logging.getLogger(__name__)

router = APIRouter()

_usecase: ResolveNodeCandidatesUsecase | None = None


def set_usecase(uc: ResolveNodeCandidatesUsecase) -> None:
    global _usecase
    _usecase = uc


@router.post("/resolve_node_candidates")
async def resolve_node_candidates(request: Request):
    body = await request.json()
    try:
      input_data = CandidateResolutionInput(**body)
    except ValidationError as e:
      return JSONResponse(status_code=422, content={"detail": e.errors()})

    assert _usecase is not None, "Usecase not initialized"
    logger.info(
        "resolve_node_candidates called",
        extra={
            "trace_id": input_data.trace_id,
            "topic_id": input_data.topic_id,
            "workspace_id": input_data.workspace_id,
            "candidate_count": len(input_data.nodes),
        },
    )
    result = await _usecase.execute(input_data)
    return JSONResponse(result.model_dump())
