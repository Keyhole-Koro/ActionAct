"""Gemini LLM adapter — supports Vertex AI and Developer API."""

from __future__ import annotations

import logging
from typing import AsyncIterator

from google import genai
from google.genai.types import Content, FunctionDeclaration, GenerateContentConfig, GoogleSearch, Part, Schema, ThinkingConfig, Tool

from app.adapter.discord_tools import ToolExecutor, run_discord_agentic_loop
from app.domain.models import LLMChunk, LLMConfig, PromptBundle

logger = logging.getLogger(__name__)

_MODEL_ALIASES = {
    "flash": "gemini-3-flash-preview",
    "deep_research": "gemini-3-pro-preview",
}

# ── Function declarations ──────────────────────────────────────────────────

_SUGGEST_DEEP_DIVES_DECL = FunctionDeclaration(
    name="suggest_deep_dives",
    description=(
        "回答に関連する深掘りポイントをグラフノードとして提案する。"
        "回答の後、ユーザーがさらに探索したいと思われるトピックを2〜4件提案すること。"
    ),
    parameters=Schema(
        type="OBJECT",
        properties={
            "suggestions": Schema(
                type="ARRAY",
                items=Schema(
                    type="OBJECT",
                    properties={
                        "label": Schema(type="STRING", description="ノードのラベル（短く端的に）"),
                        "query": Schema(type="STRING", description="深掘りクエリ（ユーザーが次に問いかける文章）"),
                    },
                    required=["label", "query"],
                ),
            )
        },
        required=["suggestions"],
    ),
)

_START_ACT_DECL = FunctionDeclaration(
    name="start_act",
    description=(
        "ユーザーの指示がなくても、自律的に別の Act（調査・要約など）を開始する。"
        "現在の回答だけでは不十分で、追加の調査が明らかに必要な場合にのみ使用すること。"
    ),
    parameters=Schema(
        type="OBJECT",
        properties={
            "act_type": Schema(
                type="STRING",
                enum=["ACT_TYPE_EXPLORE", "ACT_TYPE_INVESTIGATE"],
                description="Act の種別",
            ),
            "user_message": Schema(type="STRING", description="次の Act に渡すクエリ"),
            "anchor_node_id": Schema(type="STRING", description="起点ノード ID"),
        },
        required=["user_message", "anchor_node_id"],
    ),
)

_ACT_TOOLS = Tool(function_declarations=[_SUGGEST_DEEP_DIVES_DECL, _START_ACT_DECL])



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


def _download_from_gcs(gcs_uri: str) -> bytes:
    """Download a GCS object as bytes.

    Respects STORAGE_EMULATOR_HOST if set (local dev with fake-gcs-server).
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    without_prefix = gcs_uri.removeprefix("gs://")
    bucket_name, _, blob_name = without_prefix.partition("/")
    client = storage.Client()
    return client.bucket(bucket_name).blob(blob_name).download_as_bytes()


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
        model_name = _MODEL_ALIASES.get(config.model, config.model) or "gemini-3-flash-preview"

        parts = []
        if bundle.user_prompt:
            parts.append(Part.from_text(text=bundle.user_prompt))

        for media in bundle.user_media:
            try:
                if self._backend == "vertex":
                    # Vertex AI supports gs:// URIs natively — no download needed.
                    parts.append(Part.from_uri(file_uri=media.gcs_uri, mime_type=media.mime_type))
                else:
                    # Developer API requires raw bytes — download from GCS.
                    data = _download_from_gcs(media.gcs_uri)
                    parts.append(Part.from_bytes(data=data, mime_type=media.mime_type))
            except Exception as e:
                logger.warning("Failed to attach user media", extra={"gcs_uri": media.gcs_uri}, exc_info=e)

        if not parts:
            parts.append(Part.from_text(text="[empty message]"))

        contents = [Content(role="user", parts=parts)]

        base_tools: list[Tool] = []
        enable_function_tools = config.enable_act_tools and not config.enable_grounding
        if config.enable_act_tools and config.enable_grounding:
            logger.info("Disabling act tools because grounding is enabled")
        if enable_function_tools:
            base_tools.append(_ACT_TOOLS)
        if config.enable_grounding:
            base_tools.append(Tool(googleSearch=GoogleSearch()))
        gen_config = GenerateContentConfig(
            systemInstruction=_build_system_instruction(bundle),
            tools=base_tools,
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

            collected_function_calls: list[dict] = []

            async for response in stream:
                # テキストチャンクをストリーム
                if response.text:
                    yield LLMChunk(text=response.text, is_thought=False)

                # function_call パートを収集（ストリーム末尾に来る）
                if response.candidates:
                    for candidate in response.candidates:
                        if candidate.content and candidate.content.parts:
                            for part in candidate.content.parts:
                                if part.function_call:
                                    fc = part.function_call
                                    collected_function_calls.append({
                                        "name": fc.name,
                                        "args": dict(fc.args) if fc.args else {},
                                    })

            yield LLMChunk(text="", is_done=True, function_calls=collected_function_calls)

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
        async for chunk in run_discord_agentic_loop(
            client=self._client,
            user_message=user_message,
            system_instruction=system_instruction,
            workspace_id=workspace_id,
            tool_executor=tool_executor,
            config=config,
        ):
            yield chunk
