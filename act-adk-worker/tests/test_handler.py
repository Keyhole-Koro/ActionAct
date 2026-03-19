"""Tests for FastAPI handler — end-to-end with TestClient."""

import json
import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_healthz():
    client = TestClient(app)
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_run_act_streams_ndjson():
    client = TestClient(app)
    payload = {
        "trace_id": "t1",
        "uid": "u1",
        "topic_id": "topic-1",
        "workspace_id": "ws-1",
        "request_id": "r1",
        "act_type": "ACT_TYPE_EXPLORE",
        "user_message": "test question",
    }

    with client.stream("POST", "/run_act", json=payload) as resp:
        assert resp.status_code == 200
        assert "application/x-ndjson" in resp.headers["content-type"]

        events = []
        for line in resp.iter_lines():
            if line.strip():
                events.append(json.loads(line))

    # First event: upsert
    assert events[0]["type"] == "patch_ops"
    assert events[0]["ops"][0]["op"] == "upsert"

    # Last event: terminal done
    assert events[-1]["type"] == "terminal"
    assert events[-1]["done"] is True

    # Has text_delta events
    text_deltas = [e for e in events if e["type"] == "text_delta"]
    assert len(text_deltas) > 0

    # Has append_md events
    append_events = [
        e for e in events
        if e["type"] == "patch_ops" and e["ops"][0]["op"] == "append_md"
    ]
    assert len(append_events) > 0


def test_run_act_missing_field_returns_422():
    client = TestClient(app)
    # Missing required fields
    payload = {"trace_id": "t1"}
    resp = client.post("/run_act", json=payload)
    assert resp.status_code == 422
