from app.domain.language_policy import build_language_instruction, detect_response_language


def test_detect_response_language_returns_japanese_for_japanese_prompt():
    assert detect_response_language("awsについて教えて") == "ja"


def test_detect_response_language_returns_english_for_english_prompt():
    assert detect_response_language("Tell me about AWS") == "en"


def test_build_language_instruction_mentions_japanese_for_japanese_prompt():
    instruction = build_language_instruction("日本語で教えて")
    assert "Respond in Japanese" in instruction


def test_build_language_instruction_mentions_english_for_english_prompt():
    instruction = build_language_instruction("Explain Kubernetes basics")
    assert instruction == "Respond in English."
