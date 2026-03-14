"""Tests for config — env var parsing and defaults."""

import os
import pytest
from unittest import mock

from app.config import Config


class TestConfig:
    def test_defaults(self):
        """With no env vars set, should use defaults."""
        with mock.patch.dict(os.environ, {}, clear=True):
            cfg = Config()
            assert cfg.port == "8000"
            assert cfg.google_cloud_project == "local-dev"
            assert cfg.vertex_use_real_api is False

    def test_custom_values(self):
        with mock.patch.dict(os.environ, {
            "PORT": "9000",
            "GOOGLE_CLOUD_PROJECT": "my-project",
            "VERTEX_USE_REAL_API": "true",
        }):
            cfg = Config()
            assert cfg.port == "9000"
            assert cfg.google_cloud_project == "my-project"
            assert cfg.vertex_use_real_api is True

    def test_vertex_case_insensitive(self):
        """VERTEX_USE_REAL_API should be case-insensitive."""
        for value in ["True", "TRUE", "true", "tRuE"]:
            with mock.patch.dict(os.environ, {"VERTEX_USE_REAL_API": value}):
                cfg = Config()
                assert cfg.vertex_use_real_api is True, f"failed for {value}"

    def test_vertex_false_values(self):
        for value in ["false", "0", "no", ""]:
            with mock.patch.dict(os.environ, {"VERTEX_USE_REAL_API": value}):
                cfg = Config()
                assert cfg.vertex_use_real_api is False, f"failed for {value!r}"
