"""Shared ACT response policy for assembly/system prompts."""

from __future__ import annotations

from app.domain.language_policy import build_language_instruction

_BASE_POLICY = (
    "まずユーザーが何を求めているかを短く捉え、通常の回答を優先してください。"
    "追加確認は、回答品質が大きく下がる場合に限って followup などのツールで最小限に行ってください。"
)


def build_act_system_instruction(user_message: str) -> str:
    return f"{_BASE_POLICY} {build_language_instruction(user_message)}"
