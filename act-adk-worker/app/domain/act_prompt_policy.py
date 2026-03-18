"""Shared ACT response policy for assembly/system prompts."""

from __future__ import annotations

from app.domain.language_policy import build_language_instruction

_BASE_POLICY = (
    "まずユーザーが何を求めているかを短く捉え、通常の回答を優先してください。"
    "追加確認は、回答品質が大きく下がる場合に限って followup などのツールで最小限に行ってください。"
)

_TOOL_POLICY = (
    "回答を終えた後、ユーザーがさらに深掘りしたいと思われるトピックがあれば"
    " suggest_deep_dives を呼び出して2〜4件提案してください。"
    "提案は具体的で探索価値のあるものに絞り、自明すぎる内容は省いてください。"
    "現在の回答だけでは明らかに不十分で追加調査が必要な場合は、"
    " start_act を呼び出して自律的に調査を開始できます。"
)


def build_act_system_instruction(user_message: str) -> str:
    return f"{_BASE_POLICY} {_TOOL_POLICY} {build_language_instruction(user_message)}"
