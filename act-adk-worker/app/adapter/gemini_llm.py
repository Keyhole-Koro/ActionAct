"""Gemini LLM adapter — supports Vertex AI and Developer API."""

from __future__ import annotations

import logging
from typing import AsyncIterator

from google import genai
from google.genai.types import Content, GenerateContentConfig, GoogleSearch, Part, ThinkingConfig, Tool

from app.domain.models import LLMChunk, LLMConfig, PromptBundle

logger = logging.getLogger(__name__)


def _build_system_instruction(bundle: PromptBundle) -> str | None:
    system_parts: list[str] = []
    if bundle.system_instruction:
        system_parts.append(bundle.system_instruction)
    if bundle.context_blocks:
        context_text = "\n\n---\n\n".join(bundle.context_blocks)
        system_parts.append(
            "Reference context is provided below. Treat it as supporting material, not as the user's latest request.\n\n"
            f"{context_text}"
        )
    if not system_parts:
        return None
    return "\n\n".join(system_parts)


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

        # Keep the current user message as the sole user turn.
        contents = [Content(role="user", parts=[Part(text=bundle.user_prompt)])]

        tools = [Tool(googleSearch=GoogleSearch())] if config.enable_grounding else None
        gen_config = GenerateContentConfig(
            systemInstruction=_build_system_instruction(bundle),
            tools=tools,
            thinkingConfig=ThinkingConfig(includeThoughts=True) if config.enable_thinking else None,
        )

        try:
            logger.info(
                "Gemini generate start",
                extra={
                    "backend": self._backend,
                    "model": model_name,
                    "grounding_enabled": config.enable_grounding,
                    "thinking_enabled": config.enable_thinking,
                },
            )
            stream = await self._client.aio.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config=gen_config,
            )
            async for response in stream:
                if response.text:
                    # google-genai doesn't expose thought vs. answer natively
                    # in the basic streaming API — all chunks are answer
                    yield LLMChunk(text=response.text, is_thought=False)

            yield LLMChunk(text="", is_done=True)

        except Exception as e:
            logger.exception("Gemini generation failed")
            raise RuntimeError(f"GENERATE_WITH_MODEL: {e}") from e
