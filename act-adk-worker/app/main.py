"""act-adk-worker entrypoint — FastAPI app with DI wiring."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import Config
from app.adapter.mock_llm import MockLLM
from app.adapter.gemini_llm import GeminiLLM
from app.adapter.stub_assembly import StubAssembly
from app.usecase.run_act import RunActUsecase
from app.handler import run_act_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ──
app = FastAPI(title="act-adk-worker", version="0.1.0")

# ── DI Wiring ──
config = Config()

# Assembly adapter (stub for now)
assembly = StubAssembly()

# LLM adapter (mock or real Gemini)
if config.vertex_use_real_api:
    logger.info("Using REAL Vertex AI Gemini")
    llm = GeminiLLM(project=config.google_cloud_project)
else:
    logger.info("Using MOCK LLM (set VERTEX_USE_REAL_API=true for real API)")
    llm = MockLLM()

# Usecase
usecase = RunActUsecase(assembly=assembly, llm=llm)

# Inject usecase into handler
run_act_handler.set_usecase(usecase)

# Register routes
app.include_router(run_act_handler.router)


@app.get("/healthz")
async def healthz():
    return JSONResponse({"status": "ok"})
