"""Discord tool declarations and agentic loop for Gemini function calling."""
from __future__ import annotations

import logging
from typing import AsyncIterator, Callable, Awaitable

from google import genai
from google.genai.types import Content, FunctionDeclaration, GenerateContentConfig, Part, Schema, Tool

from app.domain.models import LLMChunk, LLMConfig

logger = logging.getLogger(__name__)

_MODEL_ALIASES = {
    "flash": "gemini-3-flash-preview",
    "deep_research": "gemini-3-pro-preview",
}

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

DISCORD_TOOL = Tool(functionDeclarations=DISCORD_TOOLS)

ToolExecutor = Callable[[str, dict, str], Awaitable[object]]


async def run_discord_agentic_loop(
    client: genai.Client,
    user_message: str,
    system_instruction: str,
    workspace_id: str,
    tool_executor: ToolExecutor,
    config: LLMConfig,
) -> AsyncIterator[LLMChunk]:
    """Agentic loop: Gemini calls Discord tools until it can answer."""
    model_name = _MODEL_ALIASES.get(config.model, config.model) or "gemini-3-flash-preview"

    gen_config = GenerateContentConfig(
        systemInstruction=system_instruction,
        tools=[DISCORD_TOOL],
    )

    contents: list[Content] = [
        Content(role="user", parts=[Part.from_text(text=user_message)])
    ]

    max_rounds = 5
    for round_num in range(max_rounds):
        logger.info("Discord agentic round %d", round_num + 1)

        response = await client.aio.models.generate_content(
            model=model_name,
            contents=contents,
            config=gen_config,
        )

        candidate = response.candidates[0] if response.candidates else None
        if not candidate:
            break

        function_calls = [
            part.function_call
            for part in candidate.content.parts
            if part.function_call is not None
        ]

        if not function_calls:
            final_text = ""
            for part in candidate.content.parts:
                if part.text:
                    final_text += part.text

            if final_text:
                chunk_size = 200
                for i in range(0, len(final_text), chunk_size):
                    yield LLMChunk(text=final_text[i:i + chunk_size], is_thought=False)
            yield LLMChunk(text="", is_done=True)
            return

        contents.append(candidate.content)

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

        contents.append(Content(role="user", parts=tool_response_parts))

    yield LLMChunk(text="(max tool rounds reached — partial answer above)", is_thought=False)
    yield LLMChunk(text="", is_done=True)
