"""Shared ACT response policy for assembly/system prompts."""

from __future__ import annotations

from app.domain.language_policy import build_language_instruction

_BASE_POLICY = (
    "まずユーザーが何を求めているかを短く捉え、通常の回答を優先してください。"
    "追加確認は、回答品質が大きく下がる場合に限って followup などのツールで最小限に行ってください。"
)

_CONTEXT_POLICY = (
    "コンテキストブロック（Selected Node Context Snapshot など）に含まれる内容は、"
    "ナレッジグラフ上のノードデータであり、会話履歴ではありません。"
    "「前回の議論で触れたように」「先ほど述べたとおり」などの表現は使わないでください。"
    "各実行は独立した知識合成タスクとして扱い、前の実行結果を引き継ぐような口調は避けてください。"
)

_TOOL_POLICY = (
    "回答を終えた後、明確に続きの探索価値があるトピックが存在する場合のみ"
    " suggest_deep_dives を呼び出して1〜2件提案してください。"
    "単純な質問・自明な回答・短い会話では提案しないでください。"
    "提案は具体的で、ユーザーが実際に深掘りしたくなるものだけに絞ってください。"
    "start_act は、現在のコンテキストだけでは根本的に回答できない独立した調査タスクが発生した場合にのみ呼び出してください。"
    "前の回答を補足する・言い換える・掘り下げるといった目的では呼び出さないでください。"
    "1回の実行につき start_act の呼び出しは最大1回までにしてください。"
)


def build_act_system_instruction(user_message: str) -> str:
    return f"{_BASE_POLICY} {_CONTEXT_POLICY} {_TOOL_POLICY} {build_language_instruction(user_message)}"
