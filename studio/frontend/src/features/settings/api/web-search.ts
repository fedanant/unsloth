// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { authFetch } from "@/features/auth/api";

export type WebSearchProviderType =
  | "duckduckgo"
  | "brave"
  | "searxng"
  | "tavily"
  | "google"
  | "bing"
  | "custom";

export interface WebSearchSettings {
  provider: WebSearchProviderType;
  brave_api_key?: string;
  brave_api_key_masked?: string;
  has_brave_api_key?: boolean;
  brave_endpoint?: string;
  searxng_url?: string;
  searxng_api_key?: string;
  searxng_api_key_masked?: string;
  has_searxng_api_key?: boolean;
  tavily_api_key?: string;
  tavily_api_key_masked?: string;
  has_tavily_api_key?: boolean;
  google_api_key?: string;
  google_api_key_masked?: string;
  has_google_api_key?: boolean;
  google_cx?: string;
  bing_api_key?: string;
  bing_api_key_masked?: string;
  has_bing_api_key?: boolean;
  bing_endpoint?: string;
  custom_url?: string;
  custom_api_key?: string;
  custom_api_key_masked?: string;
  has_custom_api_key?: boolean;
  custom_query_param?: string;
  max_results: number;
}

export interface WebSearchTestResult {
  ok: boolean;
  provider: string;
  query?: string;
  results_count: number;
  sample_results: {
    title: string;
    url: string;
    snippet: string;
  }[];
  error?: string | null;
}

export async function fetchWebSearchSettings(): Promise<WebSearchSettings> {
  const res = await authFetch("/api/settings/web-search");
  if (!res.ok) throw new Error("Failed to load web search settings");
  return res.json();
}

export async function updateWebSearchSettings(
  updates: Partial<WebSearchSettings>,
): Promise<WebSearchSettings> {
  const res = await authFetch("/api/settings/web-search", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update web search settings");
  return res.json();
}

export async function testWebSearchSettings(
  payload: Partial<WebSearchSettings> & { query?: string },
): Promise<WebSearchTestResult> {
  const res = await authFetch("/api/settings/web-search/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to test web search settings");
  return res.json();
}
