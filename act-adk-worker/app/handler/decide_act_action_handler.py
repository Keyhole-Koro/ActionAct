"""FastAPI route handler for /decide_act_action."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.domain.models import ActDecisionInput
from app.usecase.decide_act_action import DecideActActionUsecase

logger = logging.getLogger(__name__)

router = APIRouter()

_usecase: DecideActActionUsecase | None = None


def set_usecase(uc: DecideActActionUsecase) -> None:
    global _usecase
    _usecase = uc


@router.post("/decide_act_action")
async def decide_act_action(request: Request):
    body = await request.json()
    try:
        input_data = ActDecisionInput(**body)
    except ValidationError as e:
        return JSONResponse(status_code=422, content={"detail": e.errors()})

    assert _usecase is not None, "Usecase not initialized"
    logger.info(
        "decide_act_action called",
        extra={
            "trace_id": input_data.trace_id,
            "topic_id": input_data.topic_id,
            "workspace_id": input_data.workspace_id,
            "candidate_count": len(input_data.nodes),
        },
    )
    result = await _usecase.execute(input_data)
    return JSONResponse(result.model_dump(exclude_none=True))
