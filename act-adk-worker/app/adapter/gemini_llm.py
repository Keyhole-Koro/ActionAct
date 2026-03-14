"""Gemini LLM adapter — supports Vertex AI and Developer API."""

from __future__ import annotations

import logging
from typing import AsyncIterator

from google import genai
from google.genai.types import GenerateContentConfig, Content, Part

from app.domain.models import LLMChunk, LLMConfig, PromptBundle

logger = logging.getLogger(__name__)


class GeminiLLM:
    """Calls Gemini via the google-genai SDK with streaming."""

    def __init__(self, project: str, location: str = "us-central1", api_key: str | None = None):
        if api_key:
            self._client = genai.Client(api_key=api_key)
            self._backend = "developer-api"
        else:
            self._client = genai.Client(
                vertexai=True,
                project=project,
                location=location,
            )
            self._backend = "vertex"

    async def generate(
        self,
        bundle: PromptBundle,
        config: LLMConfig,
    ) -> AsyncIterator[LLMChunk]:
        model_name = config.model or "gemini-2.0-flash"

        # Build contents
        contents: list[Content] = []
        if bundle.context_blocks:
            context_text = "\n\n---\n\n".join(bundle.context_blocks)
            contents.append(Content(role="user", parts=[Part(text=f"Context:\n{context_text}")]))
        contents.append(Content(role="user", parts=[Part(text=bundle.user_prompt)]))

        gen_config = GenerateContentConfig(
            system_instruction=bundle.system_instruction or None,
        )

        try:
            logger.info("Gemini generate start", extra={"backend": self._backend, "model": model_name})
            async for response in self._client.aio.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config=gen_config,
            ):
                if response.text:
                    # google-genai doesn't expose thought vs. answer natively
                    # in the basic streaming API — all chunks are answer
                    yield LLMChunk(text=response.text, is_thought=False)

            yield LLMChunk(text="", is_done=True)

        except Exception as e:
            logger.exception("Gemini generation failed")
            raise RuntimeError(f"GENERATE_WITH_MODEL: {e}") from e
