# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

"""Unit tests for configurable web search engines & servers."""

from pathlib import Path
import sys
import types as _types

_BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

_loggers_stub = _types.ModuleType("loggers")
_loggers_stub.get_logger = lambda name: __import__("logging").getLogger(name)
sys.modules.setdefault("loggers", _loggers_stub)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routes.settings as settings_routes
from utils.web_search_settings import (
    get_web_search_settings,
    update_web_search_settings,
    execute_engine_search_raw,
    test_web_search_engine,
    mask_secret,
)


@pytest.fixture
def memory_store(monkeypatch):
    store = {}
    import storage.studio_db as studio_db

    monkeypatch.setattr(studio_db, "get_app_setting", lambda k, default=None: store.get(k, default))
    def _upsert(d):
        store.update(d)
        return store
    monkeypatch.setattr(studio_db, "upsert_app_settings", _upsert)
    from utils import web_search_settings
    web_search_settings._invalidate_cache()
    return store


@pytest.fixture
def client(memory_store, monkeypatch):
    app = FastAPI()
    app.include_router(settings_routes.router, prefix="/api/settings")
    app.dependency_overrides[settings_routes.get_current_subject] = lambda: "test-user"
    app.dependency_overrides[settings_routes._require_ui_session] = lambda: None
    return TestClient(app)


def test_mask_secret():
    assert mask_secret("") == ""
    assert mask_secret(None) == ""
    assert mask_secret("short") == "******"
    assert mask_secret("BSA_secret_key_12345") == "BSA...345"


def test_get_default_settings(client):
    res = client.get("/api/settings/web-search")
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "duckduckgo"
    assert data["has_brave_api_key"] is False
    assert data["brave_endpoint"] == "https://api.search.brave.com/res/v1/web/search"


def test_update_brave_settings(client):
    res = client.put(
        "/api/settings/web-search",
        json={
            "provider": "brave",
            "brave_api_key": "BSA_test_key_12345",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "brave"
    assert data["has_brave_api_key"] is True
    assert data["brave_api_key"] == "BSA...345"

    # Preserving masked key on next PUT
    res2 = client.put(
        "/api/settings/web-search",
        json={
            "provider": "brave",
            "brave_api_key": "BSA...345",
        },
    )
    assert res2.status_code == 200
    # Actual underlying key wasn't replaced with masked value
    raw = get_web_search_settings(mask_secrets=False)
    assert raw["brave_api_key"] == "BSA_test_key_12345"


def test_update_searxng_settings(client):
    res = client.put(
        "/api/settings/web-search",
        json={
            "provider": "searxng",
            "searxng_url": "http://localhost:8888",
            "searxng_api_key": "my-secret-key",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "searxng"
    assert data["searxng_url"] == "http://localhost:8888"
    assert data["has_searxng_api_key"] is True


def test_test_web_search_endpoint(client, monkeypatch):
    # Mock execute_engine_search_raw to verify the test endpoint
    from utils import web_search_settings

    def mock_search(query, provider, config, max_results=5, timeout=20):
        if provider == "brave" and not config.get("brave_api_key"):
            raise ValueError("No API key")
        return [
            {"title": "Unsloth AI", "url": "https://unsloth.ai", "snippet": "Fast LLM fine-tuning"}
        ]

    monkeypatch.setattr(web_search_settings, "execute_engine_search_raw", mock_search)

    # Success test
    res = client.post(
        "/api/settings/web-search/test",
        json={
            "provider": "brave",
            "brave_api_key": "BSA_valid_key_1234",
            "query": "Unsloth",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["results_count"] == 1
    assert data["sample_results"][0]["title"] == "Unsloth AI"

    # Error test
    res_err = client.post(
        "/api/settings/web-search/test",
        json={
            "provider": "brave",
            "brave_api_key": "",
            "query": "Unsloth",
        },
    )
    assert res_err.status_code == 200
    err_data = res_err.json()
    assert err_data["ok"] is False
    assert "No API key" in err_data["error"]
