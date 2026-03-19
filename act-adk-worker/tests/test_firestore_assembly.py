from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.adapter.firestore_assembly import FirestoreAssembly


class _FakeSnapshot:
    def __init__(self, doc_id: str, data):
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class _FakeDocumentReference:
    def __init__(self, path: str, docs: dict[str, dict]):
        self._path = path
        self._docs = docs

    def get(self):
        return _FakeSnapshot(self._path.rsplit("/", 1)[-1], self._docs.get(self._path))


class _FakeCollectionReference:
    def __init__(self, path: str, docs: dict[str, dict]):
        self._path = path
        self._docs = docs

    def stream(self):
        prefix = f"{self._path}/"
        depth = prefix.count("/")
        snapshots = []
        for path, data in self._docs.items():
            if not path.startswith(prefix):
                continue
            if path.count("/") != depth:
                continue
            snapshots.append(_FakeSnapshot(path.rsplit("/", 1)[-1], data))
        snapshots.sort(key=lambda snap: snap.id)
        return snapshots


class _FakeClient:
    def __init__(self, docs: dict[str, dict]):
        self._docs = docs

    def document(self, path: str):
        return _FakeDocumentReference(path, self._docs)

    def collection(self, path: str):
        return _FakeCollectionReference(path, self._docs)


@pytest.mark.asyncio
async def test_firestore_assembly_builds_context_from_outline_nodes_and_evidence():
    base = datetime(2026, 3, 14, 1, 0, tzinfo=timezone.utc)
    docs = {
        "workspaces/ws/topics/tp": {
            "title": "Agents",
            "status": "active",
            "latestOutlineVersion": 3,
            "latestDraftVersion": 5,
        },
        "workspaces/ws/topics/tp/outlines/3": {
            "summaryMd": "Outline summary",
            "mapMd": "- root\n  - child",
        },
        "workspaces/ws/topics/tp/drafts/5": {
            "summaryMd": "Draft summary",
            "sourceAtomIds": ["a1", "a2"],
        },
        "workspaces/ws/topics/tp/nodes/root": {
            "nodeId": "root",
            "title": "Root",
            "kind": "concept",
            "contextSummary": "Top level summary",
            "updatedAt": base,
        },
        "workspaces/ws/topics/tp/nodes/child": {
            "nodeId": "child",
            "title": "Child",
            "kind": "detail",
            "contextSummary": "Child detail",
            "updatedAt": base - timedelta(minutes=1),
        },
        "workspaces/ws/topics/tp/edges/e1": {
            "sourceId": "root",
            "targetId": "child",
            "relation": "supports",
            "orderKey": 10,
            "updatedAt": base,
        },
        "workspaces/ws/topics/tp/nodes/root/evidence/ev1": {
            "evidenceId": "ev1",
            "title": "Paper A",
            "snippet": "Key evidence",
            "url": "https://example.com/a",
            "confidence": 0.9,
            "updatedAt": base,
        },
        "workspaces/ws/topics/tp/actRuns/run-1": {
            "runId": "run-1",
            "status": "completed",
            "requestId": "req-1",
            "startedAt": base,
        },
    }
    assembly = FirestoreAssembly.__new__(FirestoreAssembly)
    assembly._client = _FakeClient(docs)

    bundle = await assembly.assemble(
        topic_id="tp",
        workspace_id="ws",
        anchor_node_id="root",
        context_node_ids=["root"],
        user_message="Explain this",
    )

    joined = "\n\n".join(bundle.context_blocks)
    assert "## Topic" in joined
    assert "## Latest Outline" in joined
    assert "Outline summary" in joined
    assert "## Latest Draft" in joined
    assert "## Focus Nodes" in joined
    assert "Root [concept]" in joined
    assert "## Related Nodes" in joined
    assert "Child [detail]" in joined
    assert "## Evidence" in joined
    assert "Paper A" in joined
    assert "## Recent Act Runs" in joined


@pytest.mark.asyncio
async def test_firestore_assembly_degrades_when_topic_is_missing():
    assembly = FirestoreAssembly.__new__(FirestoreAssembly)
    assembly._client = _FakeClient({})

    bundle = await assembly.assemble(
        topic_id="missing",
        workspace_id="ws",
        anchor_node_id=None,
        context_node_ids=[],
        user_message="Hello",
    )

    assert bundle.user_prompt == "Hello"
    assert bundle.context_blocks == []
    assert "回答は英語" in bundle.system_instruction
    assert "既定の応答は短く" in bundle.system_instruction


@pytest.mark.asyncio
async def test_firestore_assembly_sets_japanese_response_policy():
    docs = {
        "workspaces/ws/topics/tp": {
            "title": "Agents",
            "status": "active",
        },
    }
    assembly = FirestoreAssembly.__new__(FirestoreAssembly)
    assembly._client = _FakeClient(docs)

    bundle = await assembly.assemble(
        topic_id="tp",
        workspace_id="ws",
        anchor_node_id=None,
        context_node_ids=[],
        user_message="日本語でAWSについて教えて",
    )

    assert "回答は日本語" in bundle.system_instruction
    assert "topic context は参照資料" in bundle.system_instruction
