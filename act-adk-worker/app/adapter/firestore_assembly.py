"""Firestore-backed Context Assembly adapter."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.domain.models import PromptBundle

logger = logging.getLogger(__name__)

_SYSTEM_INSTRUCTION = (
    "You are an AI research assistant. Analyze the user's question and provide "
    "structured, insightful answers. Use markdown formatting with headers, lists, "
    "and emphasis. Prefer the provided topic context over unsupported guesses."
)

_RELATION_PRIORITY = {
    "contradicts": 4,
    "supports": 3,
    "depends_on": 2,
    "related_to": 1,
}


@dataclass(slots=True)
class _NodeRecord:
    node_id: str
    title: str
    kind: str
    parent_id: str | None
    context_summary: str
    detail_html: str
    updated_at: float
    is_focus: bool = False


class FirestoreAssembly:
    """Reads persisted topic context from Firestore and renders PromptBundle blocks."""

    def __init__(self, project: str):
        self._project = project
        self._client = None

    async def assemble(
        self,
        topic_id: str,
        workspace_id: str,
        anchor_node_id: str | None,
        context_node_ids: list[str],
        user_message: str,
    ) -> PromptBundle:
        try:
            return await asyncio.to_thread(
                self._assemble_sync,
                topic_id,
                workspace_id,
                anchor_node_id,
                context_node_ids,
                user_message,
            )
        except Exception:
            logger.exception(
                "Firestore context assembly failed; degrading to minimal bundle",
                extra={"workspace_id": workspace_id, "topic_id": topic_id},
            )
            return self._minimal_bundle(user_message)

    def _assemble_sync(
        self,
        topic_id: str,
        workspace_id: str,
        anchor_node_id: str | None,
        context_node_ids: list[str],
        user_message: str,
    ) -> PromptBundle:
        topic_path = f"workspaces/{workspace_id}/topics/{topic_id}"
        topic_doc = self._read_doc(topic_path)
        if not topic_doc:
            return self._minimal_bundle(user_message)

        selected_node_ids = self._dedupe_ids(context_node_ids, anchor_node_id)[:30]
        all_nodes = self._read_nodes(topic_path)
        node_by_id = {node.node_id: node for node in all_nodes}

        focus_nodes = self._select_focus_nodes(selected_node_ids, all_nodes, node_by_id)
        focus_node_ids = [node.node_id for node in focus_nodes]
        neighbor_edges = self._read_edges(topic_path)
        neighbor_nodes = self._select_neighbor_nodes(focus_node_ids, neighbor_edges, node_by_id)
        evidences = self._read_evidence(topic_path, focus_node_ids)
        outline_doc = self._read_latest_outline(topic_path, topic_doc)
        draft_doc = self._read_latest_draft(topic_path, topic_doc)
        act_runs = self._read_recent_act_runs(topic_path)

        context_blocks = self._render_context_blocks(
            topic_doc=topic_doc,
            outline_doc=outline_doc,
            draft_doc=draft_doc,
            focus_nodes=focus_nodes,
            neighbor_nodes=neighbor_nodes,
            neighbor_edges=neighbor_edges,
            evidences=evidences,
            act_runs=act_runs,
        )

        return PromptBundle(
            system_instruction=_SYSTEM_INSTRUCTION,
            user_prompt=user_message,
            context_blocks=context_blocks,
        )

    def _minimal_bundle(self, user_message: str) -> PromptBundle:
        return PromptBundle(
            system_instruction=_SYSTEM_INSTRUCTION,
            user_prompt=user_message,
            context_blocks=[],
        )

    def _read_doc(self, path: str) -> dict[str, Any] | None:
        snapshot = self._get_client().document(path).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict() or {}
        return data

    def _read_nodes(self, topic_path: str) -> list[_NodeRecord]:
        docs = self._get_client().collection(f"{topic_path}/nodes").stream()
        nodes: list[_NodeRecord] = []
        for doc in docs:
            data = doc.to_dict() or {}
            node_id = str(data.get("nodeId") or data.get("node_id") or doc.id)
            title = str(data.get("title") or "").strip()
            kind = str(data.get("kind") or "node").strip()
            parent_id = data.get("parentId") or data.get("parent_id")
            context_summary = str(
                data.get("contextSummary")
                or data.get("context_summary")
                or data.get("summary")
                or ""
            ).strip()
            detail_html = str(data.get("detailHtml") or data.get("detail_html") or "").strip()
            nodes.append(
                _NodeRecord(
                    node_id=node_id,
                    title=title or node_id,
                    kind=kind or "node",
                    parent_id=str(parent_id) if parent_id else None,
                    context_summary=context_summary,
                    detail_html=detail_html,
                    updated_at=self._timestamp_value(data.get("updatedAt") or data.get("updated_at")),
                )
            )
        nodes.sort(key=lambda node: (-node.updated_at, node.title, node.node_id))
        return nodes

    def _read_edges(self, topic_path: str) -> list[dict[str, Any]]:
        docs = self._get_client().collection(f"{topic_path}/edges").stream()
        edges: list[dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            relation = str(data.get("relation") or "related_to")
            edges.append(
                {
                    "edge_id": data.get("edgeId") or data.get("edge_id") or doc.id,
                    "source_id": str(data.get("sourceId") or data.get("source_id") or ""),
                    "target_id": str(data.get("targetId") or data.get("target_id") or ""),
                    "relation": relation,
                    "order_key": self._number_value(data.get("orderKey") or data.get("order_key")),
                    "updated_at": self._timestamp_value(data.get("updatedAt") or data.get("updated_at")),
                }
            )
        edges.sort(
            key=lambda edge: (
                -_RELATION_PRIORITY.get(edge["relation"], 1),
                -edge["order_key"],
                -edge["updated_at"],
                str(edge["edge_id"]),
            )
        )
        return edges

    def _read_evidence(self, topic_path: str, focus_node_ids: list[str]) -> list[dict[str, Any]]:
        evidences: list[dict[str, Any]] = []
        for node_id in focus_node_ids:
            docs = self._get_client().collection(f"{topic_path}/nodes/{node_id}/evidence").stream()
            node_evidence: list[dict[str, Any]] = []
            for doc in docs:
                data = doc.to_dict() or {}
                node_evidence.append(
                    {
                        "evidence_id": data.get("evidenceId") or data.get("evidence_id") or doc.id,
                        "node_id": node_id,
                        "title": str(data.get("title") or data.get("label") or "").strip(),
                        "snippet": str(
                            data.get("snippet")
                            or data.get("summary")
                            or data.get("claim")
                            or data.get("text")
                            or ""
                        ).strip(),
                        "url": str(data.get("url") or "").strip(),
                        "confidence": self._number_value(data.get("confidence")),
                        "updated_at": self._timestamp_value(data.get("updatedAt") or data.get("updated_at")),
                    }
                )
            node_evidence.sort(
                key=lambda item: (-item["confidence"], -item["updated_at"], str(item["evidence_id"]))
            )
            evidences.extend(node_evidence[:2])
        evidences.sort(
            key=lambda item: (-item["confidence"], -item["updated_at"], str(item["evidence_id"]))
        )
        return evidences[:5]

    def _read_latest_outline(self, topic_path: str, topic_doc: dict[str, Any]) -> dict[str, Any] | None:
        version = topic_doc.get("latestOutlineVersion") or topic_doc.get("latest_outline_version")
        if version is None:
            return None
        return self._read_doc(f"{topic_path}/outlines/{version}")

    def _read_latest_draft(self, topic_path: str, topic_doc: dict[str, Any]) -> dict[str, Any] | None:
        version = topic_doc.get("latestDraftVersion") or topic_doc.get("latest_draft_version")
        if version is None:
            return None
        return self._read_doc(f"{topic_path}/drafts/{version}")

    def _read_recent_act_runs(self, topic_path: str) -> list[dict[str, Any]]:
        docs = self._get_client().collection(f"{topic_path}/actRuns").stream()
        runs: list[dict[str, Any]] = []
        for doc in docs:
            data = doc.to_dict() or {}
            runs.append(
                {
                    "run_id": data.get("runId") or data.get("run_id") or doc.id,
                    "status": str(data.get("status") or "").strip(),
                    "request_id": str(data.get("requestId") or data.get("request_id") or "").strip(),
                    "started_at": self._timestamp_value(data.get("startedAt") or data.get("started_at")),
                    "ended_at": self._timestamp_value(data.get("endedAt") or data.get("ended_at")),
                }
            )
        runs.sort(key=lambda run: (-run["started_at"], str(run["run_id"])))
        return runs[:3]

    def _select_focus_nodes(
        self,
        selected_node_ids: list[str],
        all_nodes: list[_NodeRecord],
        node_by_id: dict[str, _NodeRecord],
    ) -> list[_NodeRecord]:
        focus_nodes: list[_NodeRecord] = []
        for node_id in selected_node_ids:
            node = node_by_id.get(node_id)
            if node is None:
                continue
            focus_nodes.append(self._clone_node(node, is_focus=True))
        if focus_nodes:
            return focus_nodes[:10]
        return [self._clone_node(node, is_focus=True) for node in all_nodes[:2]]

    def _select_neighbor_nodes(
        self,
        focus_node_ids: list[str],
        edges: list[dict[str, Any]],
        node_by_id: dict[str, _NodeRecord],
    ) -> list[_NodeRecord]:
        if not focus_node_ids:
            return []

        focus_set = set(focus_node_ids)
        neighbor_candidates: list[tuple[tuple[float, float, float, str], str]] = []
        for edge in edges:
            source_id = edge["source_id"]
            target_id = edge["target_id"]
            if source_id in focus_set and target_id and target_id not in focus_set:
                neighbor_candidates.append(
                    (
                        (
                            float(_RELATION_PRIORITY.get(edge["relation"], 1)),
                            edge["order_key"],
                            edge["updated_at"],
                            target_id,
                        ),
                        target_id,
                    )
                )
            elif target_id in focus_set and source_id and source_id not in focus_set:
                neighbor_candidates.append(
                    (
                        (
                            float(_RELATION_PRIORITY.get(edge["relation"], 1)),
                            edge["order_key"],
                            edge["updated_at"],
                            source_id,
                        ),
                        source_id,
                    )
                )

        seen: set[str] = set()
        ordered_neighbor_ids: list[str] = []
        for _, node_id in sorted(neighbor_candidates, reverse=True):
            if node_id in seen:
                continue
            seen.add(node_id)
            ordered_neighbor_ids.append(node_id)
            if len(ordered_neighbor_ids) >= 8:
                break

        return [node_by_id[node_id] for node_id in ordered_neighbor_ids if node_id in node_by_id]

    def _render_context_blocks(
        self,
        topic_doc: dict[str, Any],
        outline_doc: dict[str, Any] | None,
        draft_doc: dict[str, Any] | None,
        focus_nodes: list[_NodeRecord],
        neighbor_nodes: list[_NodeRecord],
        neighbor_edges: list[dict[str, Any]],
        evidences: list[dict[str, Any]],
        act_runs: list[dict[str, Any]],
    ) -> list[str]:
        blocks: list[str] = []

        topic_title = str(topic_doc.get("title") or topic_doc.get("topicId") or "Untitled topic").strip()
        topic_status = str(topic_doc.get("status") or "unknown").strip()
        latest_outline = topic_doc.get("latestOutlineVersion") or topic_doc.get("latest_outline_version")
        latest_draft = topic_doc.get("latestDraftVersion") or topic_doc.get("latest_draft_version")
        blocks.append(
            "\n".join(
                [
                    "## Topic",
                    f"- title: {topic_title}",
                    f"- status: {topic_status}",
                    f"- latestOutlineVersion: {latest_outline if latest_outline is not None else 'none'}",
                    f"- latestDraftVersion: {latest_draft if latest_draft is not None else 'none'}",
                ]
            )
        )

        if outline_doc:
            summary_md = str(outline_doc.get("summaryMd") or outline_doc.get("summary_md") or "").strip()
            map_md = str(outline_doc.get("mapMd") or outline_doc.get("map_md") or "").strip()
            lines = ["## Latest Outline"]
            if summary_md:
                lines.extend(["### Summary", summary_md])
            if map_md:
                lines.extend(["### Map", map_md])
            blocks.append("\n".join(lines))

        if draft_doc:
            summary_md = str(draft_doc.get("summaryMd") or draft_doc.get("summary_md") or "").strip()
            source_atom_ids = draft_doc.get("sourceAtomIds") or draft_doc.get("source_atom_ids") or []
            lines = ["## Latest Draft"]
            if summary_md:
                lines.append(summary_md)
            if source_atom_ids:
                lines.append(f"- sourceAtomIds: {', '.join(str(atom_id) for atom_id in source_atom_ids[:10])}")
            blocks.append("\n".join(lines))

        if focus_nodes:
            lines = ["## Focus Nodes"]
            for node in focus_nodes:
                lines.append(self._render_node_line(node))
            blocks.append("\n".join(lines))

        if neighbor_nodes:
            relation_lookup = self._relation_lookup(neighbor_edges)
            lines = ["## Related Nodes"]
            for node in neighbor_nodes:
                relation = relation_lookup.get(node.node_id, "related_to")
                lines.append(f"- [{relation}] {self._render_node_line(node, bullet=False)}")
            blocks.append("\n".join(lines))

        if evidences:
            lines = ["## Evidence"]
            for item in evidences:
                label = item["title"] or item["url"] or item["evidence_id"]
                snippet = item["snippet"] or "no snippet"
                url_part = f" ({item['url']})" if item["url"] else ""
                lines.append(
                    f"- node={item['node_id']} confidence={item['confidence']:.2f} {label}{url_part}: {snippet}"
                )
            blocks.append("\n".join(lines))

        if act_runs:
            lines = ["## Recent Act Runs"]
            for run in act_runs:
                lines.append(
                    f"- run={run['run_id']} status={run['status'] or 'unknown'} request={run['request_id'] or 'n/a'}"
                )
            blocks.append("\n".join(lines))

        return blocks

    def _relation_lookup(self, edges: list[dict[str, Any]]) -> dict[str, str]:
        relation_by_node: dict[str, str] = {}
        for edge in edges:
            for node_id in (edge["source_id"], edge["target_id"]):
                if not node_id or node_id in relation_by_node:
                    continue
                relation_by_node[node_id] = edge["relation"]
        return relation_by_node

    def _render_node_line(self, node: _NodeRecord, *, bullet: bool = True) -> str:
        prefix = "- " if bullet else ""
        summary = node.context_summary or f"{node.title} ({node.kind})"
        line = f"{prefix}{node.title} [{node.kind}] id={node.node_id}"
        if node.parent_id:
            line += f" parent={node.parent_id}"
        line += f": {summary}"
        return line

    def _dedupe_ids(self, node_ids: list[str], anchor_node_id: str | None) -> list[str]:
        combined = [*(node_ids or [])]
        if anchor_node_id:
            combined.insert(0, anchor_node_id)
        seen: set[str] = set()
        deduped: list[str] = []
        for node_id in combined:
            value = str(node_id).strip()
            if not value or value in seen:
                continue
            seen.add(value)
            deduped.append(value)
        return deduped

    def _get_client(self):
        if self._client is None:
            from google.cloud import firestore

            self._client = firestore.Client(project=self._project)
        return self._client

    def _clone_node(self, node: _NodeRecord, *, is_focus: bool) -> _NodeRecord:
        return _NodeRecord(
            node_id=node.node_id,
            title=node.title,
            kind=node.kind,
            parent_id=node.parent_id,
            context_summary=node.context_summary,
            detail_html=node.detail_html,
            updated_at=node.updated_at,
            is_focus=is_focus,
        )

    def _timestamp_value(self, value: Any) -> float:
        if isinstance(value, datetime):
            return value.timestamp()
        if isinstance(value, (int, float)):
            return float(value)
        if value is None:
            return 0.0
        if hasattr(value, "timestamp"):
            try:
                return float(value.timestamp())
            except Exception:
                return 0.0
        return 0.0

    def _number_value(self, value: Any) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        return 0.0
