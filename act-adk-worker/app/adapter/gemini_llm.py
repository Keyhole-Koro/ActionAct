"""Gemini LLM adapter — supports Vertex AI and Developer API."""

from __future__ import annotations

import base64
import logging
from typing import AsyncIterator, Callable, Awaitable

from google import genai
from google.genai import types as genai_types
from google.genai.types import (
    Content,
    FunctionDeclaration,
    GenerateContentConfig,
    GoogleSearch,
    Part,
    Schema,
    ThinkingConfig,
    Tool,
)

from app.domain.models import LLMChunk, LLMConfig, PromptBundle

logger = logging.getLogger(__name__)

# ── Discord tool declarations ────────────────────────────────────────────────

DISCORD_TOOLS = [
    FunctionDeclaration(
        name="list_discord_structure",
        description=(
            "List all Discord channels and threads available in this workspace. "
            "Use this first to understand what topics are discussed where."
        ),
        parameters=Schema(
            type="OBJECT",
            properties={},
            required=[],
        ),
    ),
    FunctionDeclaration(
        name="read_discord_messages",
        description=(
            "Read messages from a specific Discord channel or thread. "
            "Specify either channel_id or thread_id (thread takes priority). "
            "Use this to read the actual conversation."
        ),
        parameters=Schema(
            type="OBJECT",
            properties={
                "channel_id": Schema(type="STRING", description="The Discord channel ID to read from"),
                "thread_id": Schema(type="STRING", description="The Discord thread ID to read from"),
                "limit": Schema(type="INTEGER", description="Max messages to return (default 100)"),
            },
            required=[],
        ),
    ),
    FunctionDeclaration(
        name="search_discord_messages",
        description=(
            "Search Discord messages by keyword across all channels/threads, "
            "or within a specific channel or thread."
        ),
        parameters=Schema(
            type="OBJECT",
            properties={
                "query": Schema(type="STRING", description="Keywords to search for"),
                "channel_id": Schema(type="STRING", description="Limit search to this channel ID"),
                "thread_id": Schema(type="STRING", description="Limit search to this thread ID"),
                "limit": Schema(type="INTEGER", description="Max results (default 50)"),
            },
            required=["query"],
        ),
    ),
]

ToolExecutor = Callable[[str, dict, str], Awaitable[object]]


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

        parts = []
        if bundle.user_prompt:
            parts.append(Part.from_text(text=bundle.user_prompt))

        for media in bundle.user_media:
            try:
                data = base64.b64decode(media.data_base64)
                parts.append(Part.from_bytes(data=data, mime_type=media.mime_type))
            except Exception as e:
                logger.warning("Failed to decode user media", exc_info=e)

        if not parts:
            parts.append(Part.from_text(text="[empty message]"))

        contents = [Content(role="user", parts=parts)]

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
                    yield LLMChunk(text=response.text, is_thought=False)

            yield LLMChunk(text="", is_done=True)

        except Exception as e:
            logger.exception("Gemini generation failed")
            raise RuntimeError(f"GENERATE_WITH_MODEL: {e}") from e

    async def generate_with_discord_tools(
        self,
        user_message: str,
        system_instruction: str,
        workspace_id: str,
        tool_executor: ToolExecutor,
        config: LLMConfig,
    ) -> AsyncIterator[LLMChunk]:
        """Agentic loop: Gemini calls Discord tools until it can answer."""
        model_name = config.model or "gemini-2.0-flash"
        discord_tool = Tool(functionDeclarations=DISCORD_TOOLS)

        gen_config = GenerateContentConfig(
            systemInstruction=system_instruction,
            tools=[discord_tool],
        )

        contents: list[Content] = [
            Content(role="user", parts=[Part.from_text(text=user_message)])
        ]

        max_rounds = 5
        for round_num in range(max_rounds):
            logger.info("Discord agentic round %d", round_num + 1)

            # Non-streaming call to detect function_call vs text
            response = await self._client.aio.models.generate_content(
                model=model_name,
                contents=contents,
                config=gen_config,
            )

            candidate = response.candidates[0] if response.candidates else None
            if not candidate:
                break

            # Collect function calls from this response
            function_calls = [
                part.function_call
                for part in candidate.content.parts
                if part.function_call is not None
            ]

            if not function_calls:
                # No more tool calls — stream final answer
                final_text = ""
                for part in candidate.content.parts:
                    if part.text:
                        final_text += part.text

                if final_text:
                    # Stream in chunks
                    chunk_size = 200
                    for i in range(0, len(final_text), chunk_size):
                        yield LLMChunk(text=final_text[i:i + chunk_size], is_thought=False)
                yield LLMChunk(text="", is_done=True)
                return

            # Add model response to history
            contents.append(candidate.content)

            # Execute all function calls and collect responses
            tool_response_parts = []
            for fc in function_calls:
                fn_name = fc.name
                fn_args = dict(fc.args) if fc.args else {}
                logger.info("Executing tool %s args=%r", fn_name, fn_args)

                try:
                    result = await tool_executor(fn_name, fn_args, workspace_id)
                except Exception as e:
                    result = {"error": str(e)}

                tool_response_parts.append(
                    Part.from_function_response(
                        name=fn_name,
                        response={"result": result},
                    )
                )

            # Add tool responses to history
            contents.append(Content(role="user", parts=tool_response_parts))

        # Fallback if max rounds exceeded
        yield LLMChunk(text="(max tool rounds reached — partial answer above)", is_thought=False)
        yield LLMChunk(text="", is_done=True)
