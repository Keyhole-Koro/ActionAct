"""Configuration — reads environment variables."""

from __future__ import annotations

import os


class Config:
    port: str
    google_cloud_project: str
    vertex_use_real_api: bool
    google_api_key: str | None

    def __init__(self):
        self.port = os.getenv("PORT", "8000")
        self.google_cloud_project = os.getenv("GOOGLE_CLOUD_PROJECT", "local-dev")
        self.vertex_use_real_api = os.getenv("VERTEX_USE_REAL_API", "false").lower() == "true"
        self.google_api_key = os.getenv("GOOGLE_API_KEY") or None
