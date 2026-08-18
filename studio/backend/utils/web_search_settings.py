# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

"""Persisted Web Search Settings & multi-engine search executor.

Supports DuckDuckGo (default), Brave Search API, SearXNG servers,
Tavily, Google Custom Search, Bing Web Search, and Custom Search Web Servers.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Optional
import httpx

logger = logging.getLogger(__name__)

WEB_SEARCH_SETTINGS_KEY = "web_search_settings"
SUPPORTED_PROVIDERS = ("duckduckgo", "brave", "searxng", "tavily", "google", "bing", "custom")
DEFAULT_PROVIDER = "duckduckgo"

_lock = threading.Lock()
_cached_settings: dict[str, Any] | None = None
_cache_time: float = 0.0
_CACHE_TTL_S = 2.0


def _get_default_settings() -> dict[str, Any]:
    return {
        "provider": DEFAULT_PROVIDER,
        "brave_api_key": "",
        "brave_endpoint": "https://api.search.brave.com/res/v1/web/search",
        "searxng_url": "",
        "searxng_api_key": "",
        "tavily_api_key": "",
        "google_api_key": "",
        "google_cx": "",
        "bing_api_key": "",
        "bing_endpoint": "https://api.bing.microsoft.com/v7.0/search",
        "custom_url": "",
        "custom_api_key": "",
        "custom_query_param": "q",
        "max_results": 5,
    }


def _invalidate_cache() -> None:
    global _cached_settings, _cache_time
    with _lock:
        _cached_settings = None
        _cache_time = 0.0


def mask_secret(secret: str | None) -> str:
    if not secret:
        return ""
    s = secret.strip()
    if len(s) <= 6:
        return "******"
    return s[:3] + "..." + s[-3:]


def get_web_search_settings(mask_secrets: bool = True) -> dict[str, Any]:
    """Get the current web search configuration.

    If mask_secrets is True, API keys and secrets are masked for client display.
    """
    global _cached_settings, _cache_time
    now = time.monotonic()
    with _lock:
        if _cached_settings is not None and (now - _cache_time) < _CACHE_TTL_S:
            raw = dict(_cached_settings)
        else:
            raw = None

    if raw is None:
        try:
            from storage.studio_db import get_app_setting
            stored = get_app_setting(WEB_SEARCH_SETTINGS_KEY, {})
            if not isinstance(stored, dict):
                stored = {}
        except Exception as exc:
            logger.warning("Failed to read web search settings: %s", exc)
            stored = {}

        defaults = _get_default_settings()
        defaults.update(stored)
        raw = defaults
        with _lock:
            _cached_settings = dict(raw)
            _cache_time = time.monotonic()

    out = dict(raw)
    if mask_secrets:
        out["brave_api_key_masked"] = mask_secret(out.get("brave_api_key"))
        out["has_brave_api_key"] = bool(out.get("brave_api_key"))
        out["brave_api_key"] = mask_secret(out.get("brave_api_key"))

        out["searxng_api_key_masked"] = mask_secret(out.get("searxng_api_key"))
        out["has_searxng_api_key"] = bool(out.get("searxng_api_key"))
        out["searxng_api_key"] = mask_secret(out.get("searxng_api_key"))

        out["tavily_api_key_masked"] = mask_secret(out.get("tavily_api_key"))
        out["has_tavily_api_key"] = bool(out.get("tavily_api_key"))
        out["tavily_api_key"] = mask_secret(out.get("tavily_api_key"))

        out["google_api_key_masked"] = mask_secret(out.get("google_api_key"))
        out["has_google_api_key"] = bool(out.get("google_api_key"))
        out["google_api_key"] = mask_secret(out.get("google_api_key"))

        out["bing_api_key_masked"] = mask_secret(out.get("bing_api_key"))
        out["has_bing_api_key"] = bool(out.get("bing_api_key"))
        out["bing_api_key"] = mask_secret(out.get("bing_api_key"))

        out["custom_api_key_masked"] = mask_secret(out.get("custom_api_key"))
        out["has_custom_api_key"] = bool(out.get("custom_api_key"))
        out["custom_api_key"] = mask_secret(out.get("custom_api_key"))

    return out


def update_web_search_settings(updates: dict[str, Any]) -> dict[str, Any]:
    """Update web search settings in storage, preserving existing secrets if masked."""
    current = get_web_search_settings(mask_secrets = False)

    provider = updates.get("provider")
    if provider in SUPPORTED_PROVIDERS:
        current["provider"] = provider

    secret_fields = (
        "brave_api_key",
        "searxng_api_key",
        "tavily_api_key",
        "google_api_key",
        "bing_api_key",
        "custom_api_key",
    )
    for field in secret_fields:
        if field in updates:
            val = str(updates[field] or "").strip()
            # If client passed empty string, clear it.
            # If client passed back a masked string (contains '...'), keep existing.
            if val == "":
                current[field] = ""
            elif "..." not in val and not val.startswith("******"):
                current[field] = val

    url_fields = (
        "brave_endpoint",
        "searxng_url",
        "bing_endpoint",
        "custom_url",
        "google_cx",
        "custom_query_param",
    )
    for field in url_fields:
        if field in updates:
            current[field] = str(updates[field] or "").strip()

    if "max_results" in updates and updates["max_results"] is not None:
        try:
            current["max_results"] = max(1, min(int(updates["max_results"]), 50))
        except (ValueError, TypeError):
            pass

    from storage.studio_db import upsert_app_settings
    upsert_app_settings({WEB_SEARCH_SETTINGS_KEY: current})
    _invalidate_cache()

    return get_web_search_settings(mask_secrets = True)


def _search_brave(
    query: str,
    api_key: str,
    endpoint: str | None,
    max_results: int,
    timeout: int,
) -> list[dict[str, str]]:
    if not api_key:
        raise ValueError("Brave Search API key is not configured.")
    url = (endpoint or "https://api.search.brave.com/res/v1/web/search").strip()
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": api_key,
    }
    params = {
        "q": query,
        "count": min(max_results, 20),
    }
    with httpx.Client(timeout = timeout, follow_redirects = True) as client:
        resp = client.get(url, headers = headers, params = params)
        resp.raise_for_status()
        data = resp.json()

    out = []
    for item in data.get("web", {}).get("results", []):
        title = item.get("title") or ""
        href = item.get("url") or ""
        snippet = item.get("description") or ""
        if href:
            out.append({"title": title, "url": href, "snippet": snippet})
    return out


def _search_searxng(
    query: str,
    server_url: str,
    api_key: str | None,
    max_results: int,
    timeout: int,
) -> list[dict[str, str]]:
    if not server_url:
        raise ValueError("SearXNG server URL is not configured.")
    base = server_url.rstrip("/")
    url = f"{base}/search" if not base.endswith("/search") else base
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-Api-Key"] = api_key

    params = {
        "q": query,
        "format": "json",
    }
    with httpx.Client(timeout = timeout, follow_redirects = True) as client:
        resp = client.get(url, headers = headers, params = params)
        resp.raise_for_status()
        data = resp.json()

    out = []
    for item in data.get("results", []):
        title = item.get("title") or ""
        href = item.get("url") or item.get("link") or ""
        snippet = item.get("content") or item.get("snippet") or ""
        if href:
            out.append({"title": title, "url": href, "snippet": snippet})
    return out[:max_results]


def _search_tavily(
    query: str,
    api_key: str,
    max_results: int,
    timeout: int,
) -> list[dict[str, str]]:
    if not api_key:
        raise ValueError("Tavily API key is not configured.")
    url = "https://api.tavily.com/search"
    payload = {
        "query": query,
        "max_results": max_results,
        "api_key": api_key,
    }
    with httpx.Client(timeout = timeout, follow_redirects = True) as client:
        resp = client.post(url, json = payload)
        resp.raise_for_status()
        data = resp.json()

    out = []
    for item in data.get("results", []):
        title = item.get("title") or ""
        href = item.get("url") or ""
        snippet = item.get("content") or ""
        if href:
            out.append({"title": title, "url": href, "snippet": snippet})
    return out


def _search_google(
    query: str,
    api_key: str,
    cx: str,
    max_results: int,
    timeout: int,
) -> list[dict[str, str]]:
    if not api_key or not cx:
        raise ValueError("Google Custom Search API key and Search Engine ID (cx) must both be configured.")
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "q": query,
        "key": api_key,
        "cx": cx,
        "num": min(max_results, 10),
    }
    with httpx.Client(timeout = timeout, follow_redirects = True) as client:
        resp = client.get(url, params = params)
        resp.raise_for_status()
        data = resp.json()

    out = []
    for item in data.get("items", []):
        title = item.get("title") or ""
        href = item.get("link") or item.get("formattedUrl") or ""
        snippet = item.get("snippet") or ""
        if href:
            out.append({"title": title, "url": href, "snippet": snippet})
    return out


def _search_bing(
    query: str,
    api_key: str,
    endpoint: str | None,
    max_results: int,
    timeout: int,
) -> list[dict[str, str]]:
    if not api_key:
        raise ValueError("Bing Search API key is not configured.")
    url = (endpoint or "https://api.bing.microsoft.com/v7.0/search").strip()
    headers = {
        "Ocp-Apim-Subscription-Key": api_key,
        "Accept": "application/json",
    }
    params = {
        "q": query,
        "count": min(max_results, 20),
    }
    with httpx.Client(timeout = timeout, follow_redirects = True) as client:
        resp = client.get(url, headers = headers, params = params)
        resp.raise_for_status()
        data = resp.json()

    out = []
    for item in data.get("webPages", {}).get("value", []):
        title = item.get("name") or item.get("title") or ""
        href = item.get("url") or ""
        snippet = item.get("snippet") or ""
        if href:
            out.append({"title": title, "url": href, "snippet": snippet})
    return out


def _search_custom(
    query: str,
    server_url: str,
    api_key: str | None,
    query_param: str | None,
    max_results: int,
    timeout: int,
) -> list[dict[str, str]]:
    if not server_url:
        raise ValueError("Custom search server URL is not configured.")
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-Api-Key"] = api_key

    q_param = query_param or "q"
    params = {q_param: query}
    with httpx.Client(timeout = timeout, follow_redirects = True) as client:
        resp = client.get(server_url, headers = headers, params = params)
        resp.raise_for_status()
        data = resp.json()

    raw_items = []
    if isinstance(data, list):
        raw_items = data
    elif isinstance(data, dict):
        if "results" in data and isinstance(data["results"], list):
            raw_items = data["results"]
        elif "items" in data and isinstance(data["items"], list):
            raw_items = data["items"]
        elif "web" in data and isinstance(data["web"], dict) and "results" in data["web"]:
            raw_items = data["web"]["results"]
        elif "data" in data and isinstance(data["data"], list):
            raw_items = data["data"]

    out = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        title = item.get("title") or item.get("name") or ""
        href = item.get("url") or item.get("link") or item.get("href") or ""
        snippet = item.get("snippet") or item.get("description") or item.get("content") or item.get("body") or ""
        if href:
            out.append({"title": str(title), "url": str(href), "snippet": str(snippet)})
    return out[:max_results]


def execute_engine_search_raw(
    query: str,
    provider: str,
    config: dict[str, Any],
    max_results: int = 5,
    timeout: int = 20,
) -> list[dict[str, str]]:
    """Execute raw search against the specified provider; returns list of dicts with title, url, snippet."""
    if provider == "brave":
        return _search_brave(
            query,
            api_key = config.get("brave_api_key", ""),
            endpoint = config.get("brave_endpoint"),
            max_results = max_results,
            timeout = timeout,
        )
    elif provider == "searxng":
        return _search_searxng(
            query,
            server_url = config.get("searxng_url", ""),
            api_key = config.get("searxng_api_key"),
            max_results = max_results,
            timeout = timeout,
        )
    elif provider == "tavily":
        return _search_tavily(
            query,
            api_key = config.get("tavily_api_key", ""),
            max_results = max_results,
            timeout = timeout,
        )
    elif provider == "google":
        return _search_google(
            query,
            api_key = config.get("google_api_key", ""),
            cx = config.get("google_cx", ""),
            max_results = max_results,
            timeout = timeout,
        )
    elif provider == "bing":
        return _search_bing(
            query,
            api_key = config.get("bing_api_key", ""),
            endpoint = config.get("bing_endpoint"),
            max_results = max_results,
            timeout = timeout,
        )
    elif provider == "custom":
        return _search_custom(
            query,
            server_url = config.get("custom_url", ""),
            api_key = config.get("custom_api_key"),
            query_param = config.get("custom_query_param"),
            max_results = max_results,
            timeout = timeout,
        )
    elif provider == "duckduckgo":
        from ddgs import DDGS
        results = DDGS(timeout = timeout).text(query, max_results = max_results)
        out = []
        for r in (results or []):
            out.append({
                "title": " ".join(str(r.get("title") or "").split()),
                "url": str(r.get("href") or "").strip(),
                "snippet": " ".join(str(r.get("body") or "").split()),
            })
        return out
    else:
        raise ValueError(f"Unknown search provider: {provider}")


def test_web_search_engine(settings: dict[str, Any], query: str = "Unsloth AI") -> dict[str, Any]:
    """Test search against a candidate configuration."""
    provider = settings.get("provider", DEFAULT_PROVIDER)
    effective_config = get_web_search_settings(mask_secrets = False)

    # Merge submitted values, handling unmasked overrides
    for k, v in settings.items():
        if k.endswith("_api_key"):
            val = str(v or "").strip()
            if val and "..." not in val and not val.startswith("******"):
                effective_config[k] = val
        else:
            effective_config[k] = v

    try:
        results = execute_engine_search_raw(
            query = query,
            provider = provider,
            config = effective_config,
            max_results = 3,
            timeout = 10,
        )
        return {
            "ok": True,
            "provider": provider,
            "results_count": len(results),
            "sample_results": results[:2],
            "error": None,
        }
    except Exception as exc:
        logger.warning("Web search test failed for provider %s: %s", provider, exc)
        return {
            "ok": False,
            "provider": provider,
            "results_count": 0,
            "sample_results": [],
            "error": str(exc),
        }
