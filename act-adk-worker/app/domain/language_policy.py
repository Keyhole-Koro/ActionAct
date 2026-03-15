"""Language policy helpers for ACT responses."""

from __future__ import annotations

import re

_JAPANESE_PATTERN = re.compile(r"[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]")


def detect_response_language(user_message: str) -> str:
    """Return the response language policy inferred from the user's message."""

    if _JAPANESE_PATTERN.search(user_message or ""):
        return "ja"
    return "en"


def build_language_instruction(user_message: str) -> str:
    """Build a short system instruction that fixes the answer language."""

    language = detect_response_language(user_message)
    if language == "ja":
        return (
            "Respond in Japanese. Keep technical terms in English only when that is the standard term, "
            "but explain the answer itself in Japanese."
        )
    return "Respond in English."
