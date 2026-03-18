"""DiscordStore — reads Discord messages from GCS for agentic RAG.

Structure:
  GCS: discord/{workspace_id}/{channel_or_thread_id}/{message_id}.json

Firestore (structure index):
  workspaces/{workspace_id}/discord_channels/{channel_id}
  workspaces/{workspace_id}/discord_threads/{thread_id}
"""
from __future__ import annotations

import json
import logging

from google.cloud import firestore, storage

logger = logging.getLogger(__name__)


class DiscordStore:
    """Read-only access to Discord messages stored in GCS, with structure index in Firestore."""

    def __init__(self, project: str, bucket: str):
        self._bucket = storage.Client(project=project).bucket(bucket)
        self._db = firestore.Client(project=project)

    # ── Structure index ──────────────────────────────────────────────────────

    def list_structure(self, workspace_id: str) -> list[dict]:
        """Return channels and threads from the Firestore structure index.

        Falls back to GCS prefix enumeration if the index is empty
        (e.g. before the ActionOrganize pipeline has run).
        """
        result: list[dict] = []

        channels = self._db.collection(f"workspaces/{workspace_id}/discord_channels").stream()
        for doc in channels:
            d = doc.to_dict()
            result.append({
                "type": "channel",
                "id": doc.id,
                "name": d.get("name", doc.id),
                "category": d.get("category_name"),
                "guild": d.get("guild_name"),
            })

        threads = self._db.collection(f"workspaces/{workspace_id}/discord_threads").stream()
        for doc in threads:
            d = doc.to_dict()
            result.append({
                "type": "thread",
                "id": doc.id,
                "name": d.get("name", doc.id),
                "parent_channel_id": d.get("channel_id"),
                "parent_channel_name": d.get("channel_name"),
                "guild": d.get("guild_name"),
            })

        if not result:
            result = self._list_structure_from_gcs(workspace_id)

        logger.info("list_structure workspace=%s items=%d", workspace_id, len(result))
        return result

    def _list_structure_from_gcs(self, workspace_id: str) -> list[dict]:
        """Derive container list from GCS pseudo-directory prefixes (fallback)."""
        prefix = f"discord/{workspace_id}/"
        iterator = self._bucket.list_blobs(prefix=prefix, delimiter="/")
        list(iterator)  # consume iterator to populate .prefixes
        result = []
        for sub_prefix in iterator.prefixes or []:
            container_id = sub_prefix.rstrip("/").split("/")[-1]
            result.append({
                "type": "channel_or_thread",
                "id": container_id,
                "name": container_id,
            })
        return result

    # ── Message reader ───────────────────────────────────────────────────────

    def read_messages(
        self,
        workspace_id: str,
        channel_id: str | None = None,
        thread_id: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Read messages from GCS for a channel or thread, ordered by timestamp."""
        container_id = thread_id or channel_id
        if not container_id:
            return []

        prefix = f"discord/{workspace_id}/{container_id}/"
        blobs = sorted(
            self._bucket.list_blobs(prefix=prefix),
            key=lambda b: b.name,
        )[:limit]

        result = []
        for blob in blobs:
            try:
                data = json.loads(blob.download_as_text())
                result.append({
                    "message_id": data.get("message_id"),
                    "author": data.get("author_name"),
                    "content": data.get("content"),
                    "timestamp": data.get("timestamp", ""),
                    "channel": data.get("channel_name"),
                    "thread": data.get("thread_name"),
                })
            except Exception:
                logger.warning("Failed to read blob %s", blob.name)

        logger.info(
            "read_messages workspace=%s container=%s count=%d",
            workspace_id, container_id, len(result),
        )
        return result

    def search_messages(
        self,
        workspace_id: str,
        query: str,
        channel_id: str | None = None,
        thread_id: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Keyword search within a channel/thread, or across all containers."""
        if channel_id or thread_id:
            candidates = self.read_messages(
                workspace_id, channel_id=channel_id, thread_id=thread_id, limit=500,
            )
        else:
            prefix = f"discord/{workspace_id}/"
            candidates = []
            for blob in sorted(self._bucket.list_blobs(prefix=prefix), key=lambda b: b.name):
                try:
                    data = json.loads(blob.download_as_text())
                    candidates.append({
                        "message_id": data.get("message_id"),
                        "author": data.get("author_name"),
                        "content": data.get("content"),
                        "timestamp": data.get("timestamp", ""),
                        "channel": data.get("channel_name"),
                        "thread": data.get("thread_name"),
                    })
                except Exception:
                    logger.warning("Failed to read blob during search: %s", blob.name)

        keywords = query.lower().split()
        matched = [
            m for m in candidates
            if any(kw in (m.get("content") or "").lower() for kw in keywords)
        ]
        logger.info(
            "search_messages workspace=%s query=%r matches=%d",
            workspace_id, query, len(matched),
        )
        return matched[:limit]
