"""DiscordStore — reads Discord messages from Firestore for agentic RAG."""

from __future__ import annotations

import logging

from google.cloud import firestore

logger = logging.getLogger(__name__)


class DiscordStore:
    """Read-only access to Discord messages stored in Firestore."""

    def __init__(self, project: str):
        self._db = firestore.AsyncClient(project=project)

    def _col(self, workspace_id: str):
        return self._db.collection(
            f"workspaces/{workspace_id}/discord_messages"
        )

    async def list_structure(self, workspace_id: str) -> list[dict]:
        """Return deduplicated channels and threads with their titles."""
        col = self._col(workspace_id)
        docs = col.stream()
        seen_channels: dict[str, dict] = {}
        seen_threads: dict[str, dict] = {}
        async for doc in docs:
            d = doc.to_dict()
            ch_id = d.get("channel_id")
            th_id = d.get("thread_id")
            if ch_id and ch_id not in seen_channels:
                seen_channels[ch_id] = {
                    "type": "channel",
                    "id": ch_id,
                    "name": d.get("channel_name", ch_id),
                    "category": d.get("category_name"),
                    "guild": d.get("guild_name"),
                }
            if th_id and th_id not in seen_threads:
                seen_threads[th_id] = {
                    "type": "thread",
                    "id": th_id,
                    "name": d.get("thread_name", th_id),
                    "parent_channel_id": ch_id,
                    "parent_channel_name": d.get("channel_name"),
                    "guild": d.get("guild_name"),
                }
        result = list(seen_channels.values()) + list(seen_threads.values())
        logger.info("list_structure workspace=%s items=%d", workspace_id, len(result))
        return result

    async def read_messages(
        self,
        workspace_id: str,
        channel_id: str | None = None,
        thread_id: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Return messages ordered by timestamp, optionally filtered."""
        col = self._col(workspace_id)
        query = col.order_by("timestamp")
        if thread_id:
            query = query.where("thread_id", "==", thread_id)
        elif channel_id:
            query = query.where("channel_id", "==", channel_id)
        query = query.limit(limit)
        result = []
        async for doc in query.stream():
            d = doc.to_dict()
            result.append({
                "message_id": d.get("message_id"),
                "author": d.get("author_name"),
                "content": d.get("content"),
                "timestamp": str(d.get("timestamp", "")),
                "channel": d.get("channel_name"),
                "thread": d.get("thread_name"),
            })
        logger.info(
            "read_messages workspace=%s channel=%s thread=%s count=%d",
            workspace_id, channel_id, thread_id, len(result),
        )
        return result

    async def search_messages(
        self,
        workspace_id: str,
        query: str,
        channel_id: str | None = None,
        thread_id: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Keyword search: client-side filter on content."""
        all_msgs = await self.read_messages(
            workspace_id,
            channel_id=channel_id,
            thread_id=thread_id,
            limit=500,
        )
        keywords = query.lower().split()
        matched = [
            m for m in all_msgs
            if any(kw in (m.get("content") or "").lower() for kw in keywords)
        ]
        logger.info(
            "search_messages workspace=%s query=%r matches=%d",
            workspace_id, query, len(matched),
        )
        return matched[:limit]
