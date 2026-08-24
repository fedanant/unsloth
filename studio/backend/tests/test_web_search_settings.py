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
    get_web_search_proxy_url,
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
    assert data["network_route"] == "direct"
    assert data["tor_proxy_url"] == "socks5h://127.0.0.1:9050"
    assert data["i2p_proxy_url"] == "http://127.0.0.1:4444"


def test_update_network_route_settings(client):
    res = client.put(
        "/api/settings/web-search",
        json={
            "network_route": "tor",
            "tor_proxy_url": "socks5h://127.0.0.1:9150",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["network_route"] == "tor"
    assert data["tor_proxy_url"] == "socks5h://127.0.0.1:9150"


@pytest.mark.parametrize(
    "config,expected",
    [
        ({"network_route": "direct"}, None),
        (
            {"network_route": "tor", "tor_proxy_url": "socks5h://127.0.0.1:9050"},
            "socks5h://127.0.0.1:9050",
        ),
        (
            {"network_route": "i2p", "i2p_proxy_url": "http://127.0.0.1:4444"},
            "http://127.0.0.1:4444",
        ),
    ],
)
def test_get_web_search_proxy_url(config, expected):
    assert get_web_search_proxy_url(config) == expected


@pytest.mark.parametrize(
    "config,error",
    [
        ({"network_route": "tor", "tor_proxy_url": "socks5://127.0.0.1:9050"}, "socks5h"),
        ({"network_route": "tor", "tor_proxy_url": ""}, "not configured"),
        ({"network_route": "i2p", "i2p_proxy_url": "socks5h://127.0.0.1:4447"}, "http"),
        ({"network_route": "unknown"}, "Unknown"),
    ],
)
def test_get_web_search_proxy_url_rejects_unsafe_or_invalid_routes(config, error):
    with pytest.raises(ValueError, match=error):
        get_web_search_proxy_url(config)


def test_duckduckgo_receives_explicit_tor_proxy(monkeypatch):
    captured = {}

    class FakeDDGS:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def text(self, query, max_results):
            return [{"title": "Result", "href": "https://example.com", "body": query}]

    fake_module = _types.ModuleType("ddgs")
    fake_module.DDGS = FakeDDGS
    monkeypatch.setitem(sys.modules, "ddgs", fake_module)

    results = execute_engine_search_raw(
        "private query",
        provider="duckduckgo",
        config={
            "network_route": "tor",
            "tor_proxy_url": "socks5h://127.0.0.1:9050",
        },
        timeout=7,
    )

    assert captured == {"timeout": 7, "proxy": "socks5h://127.0.0.1:9050"}
    assert results[0]["url"] == "https://example.com"


def test_http_search_client_uses_explicit_proxy_and_ignores_environment(monkeypatch):
    from utils import web_search_settings

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"web": {"results": []}}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(web_search_settings.httpx, "Client", FakeClient)
    execute_engine_search_raw(
        "query",
        provider="brave",
        config={
            "network_route": "tor",
            "tor_proxy_url": "socks5h://127.0.0.1:9050",
            "brave_api_key": "test-key",
        },
        timeout=11,
    )

    assert captured["proxy"] == "socks5h://127.0.0.1:9050"
    assert captured["trust_env"] is False
    assert captured["follow_redirects"] is True


def test_provider_fallback_keeps_selected_privacy_route(monkeypatch):
    import core.inference.tools as tools
    from utils import web_search_settings

    settings = {
        "provider": "brave",
        "network_route": "tor",
        "tor_proxy_url": "socks5h://127.0.0.1:9050",
    }
    calls = []

    def fake_execute(query, provider, config, max_results=5, timeout=20):
        calls.append((provider, dict(config)))
        if provider == "brave":
            raise RuntimeError("provider unavailable")
        return [
            {
                "title": "Fallback result",
                "url": "https://example.com",
                "snippet": "still proxied",
            }
        ]

    monkeypatch.setattr(
        web_search_settings,
        "get_web_search_settings",
        lambda mask_secrets=False: dict(settings),
    )
    monkeypatch.setattr(web_search_settings, "execute_engine_search_raw", fake_execute)

    result = tools._web_search("query", max_results=1, timeout=5)

    assert "Fallback result" in result
    assert [provider for provider, _config in calls] == ["brave", "duckduckgo"]
    assert all(config["network_route"] == "tor" for _provider, config in calls)


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
