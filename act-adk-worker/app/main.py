"""act-adk-worker entrypoint — FastAPI app with DI wiring."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import Config
from app.adapter.firestore_assembly import FirestoreAssembly
from app.adapter.gemini_llm import GeminiLLM
from app.usecase.run_act import RunActUsecase
from app.usecase.resolve_node_candidates import ResolveNodeCandidatesUsecase
from app.handler import run_act_handler, resolve_node_candidates_handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ──
app = FastAPI(title="act-adk-worker", version="0.1.0")

# ── DI Wiring ──
config = Config()

# Assembly adapter (read-only Firestore retrieval with graceful degrade)
assembly = FirestoreAssembly(project=config.google_cloud_project)

# LLM adapter (Gemini Developer API or Vertex AI Gemini)
if config.google_api_key:
    logger.info("Using REAL Gemini Developer API")
    llm = GeminiLLM(project=config.google_cloud_project, api_key=config.google_api_key)
elif config.vertex_use_real_api:
    logger.info("Using REAL Vertex AI Gemini")
    llm = GeminiLLM(project=config.google_cloud_project)
else:
    raise RuntimeError("GOOGLE_API_KEY or VERTEX_USE_REAL_API=true is required")

# Usecase
usecase = RunActUsecase(assembly=assembly, llm=llm)
candidate_usecase = ResolveNodeCandidatesUsecase(llm=llm)

# Inject usecase into handler
run_act_handler.set_usecase(usecase)
resolve_node_candidates_handler.set_usecase(candidate_usecase)

# Register routes
app.include_router(run_act_handler.router)
app.include_router(resolve_node_candidates_handler.router)


@app.get("/healthz")
async def healthz():
    return JSONResponse({"status": "ok"})
