"""FastAPI route handler for /run_act → SSE streaming."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.responses import StreamingResponse

from app.domain.models import RunActInput
from app.usecase.run_act import RunActUsecase

logger = logging.getLogger(__name__)

router = APIRouter()

# Will be set during app startup via dependency injection
_usecase: RunActUsecase | None = None


def set_usecase(uc: RunActUsecase) -> None:
    global _usecase
    _usecase = uc


@router.post("/run_act")
async def run_act(request: Request):
    """Accept JSON, run the pipeline, return ndjson SSE stream."""
    body = await request.json()
    try:
        input_data = RunActInput(**body)
    except ValidationError as e:
        return JSONResponse(status_code=422, content={"detail": e.errors()})

    logger.info(
        "run_act called",
        extra={
            "trace_id": input_data.trace_id,
            "topic_id": input_data.topic_id,
            "act_type": input_data.act_type,
        },
    )

    assert _usecase is not None, "Usecase not initialized"

    async def event_stream():
        async for event in _usecase.execute(input_data):
            line = event.model_dump_json(exclude_none=True)
            yield line + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"X-Content-Type-Options": "nosniff"},
    )
