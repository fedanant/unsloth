// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { type TranslationKey, useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type WebSearchNetworkRoute,
  type WebSearchProviderType,
  type WebSearchSettings,
  type WebSearchTestResult,
  fetchWebSearchSettings,
  testWebSearchSettings,
  updateWebSearchSettings,
} from "../api/web-search";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

const PROVIDER_OPTIONS: {
  id: WebSearchProviderType;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  badge?: string;
}[] = [
  {
    id: "duckduckgo",
    labelKey: "settings.chat.webSearch.providers.duckduckgo",
    descriptionKey: "settings.chat.webSearch.providers.duckduckgoDesc",
    badge: "Free / No Key",
  },
  {
    id: "brave",
    labelKey: "settings.chat.webSearch.providers.brave",
    descriptionKey: "settings.chat.webSearch.providers.braveDesc",
    badge: "Brave Search API",
  },
  {
    id: "searxng",
    labelKey: "settings.chat.webSearch.providers.searxng",
    descriptionKey: "settings.chat.webSearch.providers.searxngDesc",
    badge: "Self-Hosted / Web Server",
  },
  {
    id: "tavily",
    labelKey: "settings.chat.webSearch.providers.tavily",
    descriptionKey: "settings.chat.webSearch.providers.tavilyDesc",
    badge: "AI Optimized",
  },
  {
    id: "google",
    labelKey: "settings.chat.webSearch.providers.google",
    descriptionKey: "settings.chat.webSearch.providers.googleDesc",
    badge: "Custom Search API",
  },
  {
    id: "bing",
    labelKey: "settings.chat.webSearch.providers.bing",
    descriptionKey: "settings.chat.webSearch.providers.bingDesc",
    badge: "Azure Search",
  },
  {
    id: "custom",
    labelKey: "settings.chat.webSearch.providers.custom",
    descriptionKey: "settings.chat.webSearch.providers.customDesc",
    badge: "Custom Web Server",
  },
];

const NETWORK_ROUTE_OPTIONS: {
  id: WebSearchNetworkRoute;
  labelKey: TranslationKey;
  badge?: string;
}[] = [
  {
    id: "direct",
    labelKey: "settings.chat.webSearch.network.direct",
  },
  {
    id: "tor",
    labelKey: "settings.chat.webSearch.network.tor",
    badge: "SOCKS5h",
  },
  {
    id: "i2p",
    labelKey: "settings.chat.webSearch.network.i2p",
    badge: "Experimental",
  },
];

const DEFAULT_SETTINGS: WebSearchSettings = {
  provider: "duckduckgo",
  network_route: "direct",
  tor_proxy_url: "socks5h://127.0.0.1:9050",
  i2p_proxy_url: "http://127.0.0.1:4444",
  brave_api_key: "",
  brave_endpoint: "https://api.search.brave.com/res/v1/web/search",
  searxng_url: "",
  searxng_api_key: "",
  tavily_api_key: "",
  google_api_key: "",
  google_cx: "",
  bing_api_key: "",
  bing_endpoint: "https://api.bing.microsoft.com/v7.0/search",
  custom_url: "",
  custom_api_key: "",
  custom_query_param: "q",
  max_results: 5,
};

export function WebSearchSettingsSection() {
  const t = useT();
  const [settings, setSettings] = useState<WebSearchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Test state
  const [testQuery, setTestQuery] = useState("Unsloth AI");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WebSearchTestResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchWebSearchSettings();
      setSettings(data);
    } catch {
      setSettings((prev) => prev ?? DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveUpdates = async (updates: Partial<WebSearchSettings>) => {
    setSaving(true);
    try {
      const updated = await updateWebSearchSettings(updates);
      setSettings(updated);
      toast.success(t("settings.chat.webSearch.saveSuccess"));
    } catch {
      toast.error(t("settings.chat.webSearch.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = async (provider: WebSearchProviderType) => {
    const current = settings ?? DEFAULT_SETTINGS;
    const next = { ...current, provider };
    setSettings(next);
    await saveUpdates({ provider });
  };

  const handleNetworkRouteChange = async (
    networkRoute: WebSearchNetworkRoute,
  ) => {
    const current = settings ?? DEFAULT_SETTINGS;
    const next = { ...current, network_route: networkRoute };
    setSettings(next);
    await saveUpdates({ network_route: networkRoute });
  };

  const runTest = async () => {
    const current = settings ?? DEFAULT_SETTINGS;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testWebSearchSettings({
        ...current,
        query: testQuery.trim() || "Unsloth AI",
      });
      setTestResult(result);
      if (result.ok) {
        toast.success(
          t("settings.chat.webSearch.testSuccess", {
            count: result.results_count,
          }),
        );
      } else {
        toast.error(result.error || t("settings.chat.webSearch.testFailed"));
      }
    } catch (err: any) {
      const msg = err?.message || t("settings.chat.webSearch.testFailed");
      setTestResult({
        ok: false,
        provider: current.provider,
        results_count: 0,
        sample_results: [],
        error: msg,
      });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  if (loading && !settings) {
    return (
      <SettingsSection
        title={t("settings.chat.webSearch.title")}
        description={t("settings.chat.webSearch.description")}
      >
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Spinner className="size-4" />
          <span>{t("common.loading")}</span>
        </div>
      </SettingsSection>
    );
  }

  const currentSettings = settings ?? DEFAULT_SETTINGS;
  const activeProvider = currentSettings.provider || "duckduckgo";
  const activeNetworkRoute = currentSettings.network_route || "direct";

  return (
    <SettingsSection
      title={t("settings.chat.webSearch.title")}
      description={t("settings.chat.webSearch.description")}
    >
      <SettingsRow
        label={t("settings.chat.webSearch.engineLabel")}
        description={t("settings.chat.webSearch.engineDescription")}
      >
        <Select
          value={activeProvider}
          onValueChange={(val) =>
            handleProviderChange(val as WebSearchProviderType)
          }
        >
          <SelectTrigger
            className="w-64 max-w-full font-medium"
            aria-label={t("settings.chat.webSearch.engineLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                <div className="flex items-center gap-2">
                  <span>{t(opt.labelKey)}</span>
                  {opt.badge ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                      {opt.badge}
                    </span>
                  ) : null}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsRow
        label={t("settings.chat.webSearch.networkLabel")}
        description={t("settings.chat.webSearch.networkDescription")}
      >
        <Select
          value={activeNetworkRoute}
          onValueChange={(val) =>
            handleNetworkRouteChange(val as WebSearchNetworkRoute)
          }
        >
          <SelectTrigger
            className="w-64 max-w-full font-medium"
            aria-label={t("settings.chat.webSearch.networkLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NETWORK_ROUTE_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                <div className="flex items-center gap-2">
                  <span>{t(opt.labelKey)}</span>
                  {opt.badge ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                      {opt.badge}
                    </span>
                  ) : null}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      {activeNetworkRoute === "tor" && (
        <SettingsRow
          label={t("settings.chat.webSearch.tor.proxyLabel")}
          description={t("settings.chat.webSearch.tor.proxyDescription")}
        >
          <Input
            type="text"
            placeholder="socks5h://127.0.0.1:9050"
            value={currentSettings.tor_proxy_url || ""}
            onChange={(e) =>
              setSettings({
                ...currentSettings,
                tor_proxy_url: e.target.value,
              })
            }
            onBlur={() =>
              saveUpdates({ tor_proxy_url: currentSettings.tor_proxy_url })
            }
            className="w-80 max-w-full font-mono text-xs"
          />
        </SettingsRow>
      )}

      {activeNetworkRoute === "i2p" && (
        <SettingsRow
          label={t("settings.chat.webSearch.i2p.proxyLabel")}
          description={t("settings.chat.webSearch.i2p.proxyDescription")}
        >
          <Input
            type="text"
            placeholder="http://127.0.0.1:4444"
            value={currentSettings.i2p_proxy_url || ""}
            onChange={(e) =>
              setSettings({
                ...currentSettings,
                i2p_proxy_url: e.target.value,
              })
            }
            onBlur={() =>
              saveUpdates({ i2p_proxy_url: currentSettings.i2p_proxy_url })
            }
            className="w-80 max-w-full font-mono text-xs"
          />
        </SettingsRow>
      )}

      {/* Brave Search Settings */}
      {activeProvider === "brave" && (
        <>
          <SettingsRow
            label={t("settings.chat.webSearch.brave.apiKeyLabel")}
            description={
              <span>
                {t("settings.chat.webSearch.brave.apiKeyDescription")}{" "}
                <a
                  href="https://brave.com/search/api/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  {t("settings.chat.webSearch.brave.getKeyLink")}
                </a>
              </span>
            }
          >
            <div className="relative flex w-80 max-w-full items-center">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={
                  currentSettings.has_brave_api_key
                    ? currentSettings.brave_api_key_masked || "BSA..."
                    : "BSA..."
                }
                value={currentSettings.brave_api_key || ""}
                onChange={(e) =>
                  setSettings({
                    ...currentSettings,
                    brave_api_key: e.target.value,
                  })
                }
                onBlur={() =>
                  saveUpdates({
                    brave_api_key: currentSettings.brave_api_key,
                  })
                }
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </SettingsRow>
          <SettingsRow
            label={t("settings.chat.webSearch.brave.endpointLabel")}
            description={t("settings.chat.webSearch.brave.endpointDescription")}
          >
            <Input
              type="text"
              placeholder="https://api.search.brave.com/res/v1/web/search"
              value={
                currentSettings.brave_endpoint ||
                "https://api.search.brave.com/res/v1/web/search"
              }
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  brave_endpoint: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({
                  brave_endpoint: currentSettings.brave_endpoint,
                })
              }
              className="w-80 max-w-full font-mono text-xs"
            />
          </SettingsRow>
        </>
      )}

      {/* SearXNG Web Server Settings */}
      {activeProvider === "searxng" && (
        <>
          <SettingsRow
            label={t("settings.chat.webSearch.searxng.urlLabel")}
            description={t("settings.chat.webSearch.searxng.urlDescription")}
          >
            <Input
              type="text"
              placeholder="http://localhost:8080"
              value={currentSettings.searxng_url || ""}
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  searxng_url: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({ searxng_url: currentSettings.searxng_url })
              }
              className="w-80 max-w-full font-mono text-xs"
            />
          </SettingsRow>
          <SettingsRow
            label={t("settings.chat.webSearch.searxng.apiKeyLabel")}
            description={t("settings.chat.webSearch.searxng.apiKeyDescription")}
          >
            <div className="relative flex w-80 max-w-full items-center">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={
                  currentSettings.has_searxng_api_key
                    ? currentSettings.searxng_api_key_masked ||
                      "Optional secret"
                    : t("settings.chat.webSearch.optionalSecret")
                }
                value={currentSettings.searxng_api_key || ""}
                onChange={(e) =>
                  setSettings({
                    ...currentSettings,
                    searxng_api_key: e.target.value,
                  })
                }
                onBlur={() =>
                  saveUpdates({
                    searxng_api_key: currentSettings.searxng_api_key,
                  })
                }
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide key" : "Show key"}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </SettingsRow>
        </>
      )}

      {/* Tavily AI Search Settings */}
      {activeProvider === "tavily" && (
        <SettingsRow
          label={t("settings.chat.webSearch.tavily.apiKeyLabel")}
          description={
            <span>
              {t("settings.chat.webSearch.tavily.apiKeyDescription")}{" "}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                {t("settings.chat.webSearch.tavily.getKeyLink")}
              </a>
            </span>
          }
        >
          <div className="relative flex w-80 max-w-full items-center">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={
                currentSettings.has_tavily_api_key
                  ? currentSettings.tavily_api_key_masked || "tvly-..."
                  : "tvly-..."
              }
              value={currentSettings.tavily_api_key || ""}
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  tavily_api_key: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({
                  tavily_api_key: currentSettings.tavily_api_key,
                })
              }
              className="pr-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              className="absolute right-2.5 text-muted-foreground hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </SettingsRow>
      )}

      {/* Google Custom Search Settings */}
      {activeProvider === "google" && (
        <>
          <SettingsRow
            label={t("settings.chat.webSearch.google.apiKeyLabel")}
            description={t("settings.chat.webSearch.google.apiKeyDescription")}
          >
            <div className="relative flex w-80 max-w-full items-center">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={
                  currentSettings.has_google_api_key
                    ? currentSettings.google_api_key_masked || "AIzaSy..."
                    : "AIzaSy..."
                }
                value={currentSettings.google_api_key || ""}
                onChange={(e) =>
                  setSettings({
                    ...currentSettings,
                    google_api_key: e.target.value,
                  })
                }
                onBlur={() =>
                  saveUpdates({
                    google_api_key: currentSettings.google_api_key,
                  })
                }
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </SettingsRow>
          <SettingsRow
            label={t("settings.chat.webSearch.google.cxLabel")}
            description={t("settings.chat.webSearch.google.cxDescription")}
          >
            <Input
              type="text"
              placeholder="012345678901234567890:abcdefghijk"
              value={currentSettings.google_cx || ""}
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  google_cx: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({ google_cx: currentSettings.google_cx })
              }
              className="w-80 max-w-full font-mono text-xs"
            />
          </SettingsRow>
        </>
      )}

      {/* Bing Search Settings */}
      {activeProvider === "bing" && (
        <>
          <SettingsRow
            label={t("settings.chat.webSearch.bing.apiKeyLabel")}
            description={t("settings.chat.webSearch.bing.apiKeyDescription")}
          >
            <div className="relative flex w-80 max-w-full items-center">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={
                  currentSettings.has_bing_api_key
                    ? currentSettings.bing_api_key_masked || "Ocp-Apim-Key"
                    : "Ocp-Apim-Key"
                }
                value={currentSettings.bing_api_key || ""}
                onChange={(e) =>
                  setSettings({
                    ...currentSettings,
                    bing_api_key: e.target.value,
                  })
                }
                onBlur={() =>
                  saveUpdates({
                    bing_api_key: currentSettings.bing_api_key,
                  })
                }
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </SettingsRow>
          <SettingsRow
            label={t("settings.chat.webSearch.bing.endpointLabel")}
            description={t("settings.chat.webSearch.bing.endpointDescription")}
          >
            <Input
              type="text"
              placeholder="https://api.bing.microsoft.com/v7.0/search"
              value={
                currentSettings.bing_endpoint ||
                "https://api.bing.microsoft.com/v7.0/search"
              }
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  bing_endpoint: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({
                  bing_endpoint: currentSettings.bing_endpoint,
                })
              }
              className="w-80 max-w-full font-mono text-xs"
            />
          </SettingsRow>
        </>
      )}

      {/* Custom Search Web Server Settings */}
      {activeProvider === "custom" && (
        <>
          <SettingsRow
            label={t("settings.chat.webSearch.custom.urlLabel")}
            description={t("settings.chat.webSearch.custom.urlDescription")}
          >
            <Input
              type="text"
              placeholder="http://localhost:8000/search"
              value={currentSettings.custom_url || ""}
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  custom_url: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({ custom_url: currentSettings.custom_url })
              }
              className="w-80 max-w-full font-mono text-xs"
            />
          </SettingsRow>
          <SettingsRow
            label={t("settings.chat.webSearch.custom.apiKeyLabel")}
            description={t("settings.chat.webSearch.custom.apiKeyDescription")}
          >
            <div className="relative flex w-80 max-w-full items-center">
              <Input
                type={showKey ? "text" : "password"}
                placeholder={
                  currentSettings.has_custom_api_key
                    ? currentSettings.custom_api_key_masked ||
                      "Optional Auth Key"
                    : t("settings.chat.webSearch.optionalSecret")
                }
                value={currentSettings.custom_api_key || ""}
                onChange={(e) =>
                  setSettings({
                    ...currentSettings,
                    custom_api_key: e.target.value,
                  })
                }
                onBlur={() =>
                  saveUpdates({
                    custom_api_key: currentSettings.custom_api_key,
                  })
                }
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </SettingsRow>
          <SettingsRow
            label={t("settings.chat.webSearch.custom.queryParamLabel")}
            description={t(
              "settings.chat.webSearch.custom.queryParamDescription",
            )}
          >
            <Input
              type="text"
              placeholder="q"
              value={currentSettings.custom_query_param || "q"}
              onChange={(e) =>
                setSettings({
                  ...currentSettings,
                  custom_query_param: e.target.value,
                })
              }
              onBlur={() =>
                saveUpdates({
                  custom_query_param: currentSettings.custom_query_param,
                })
              }
              className="w-36 max-w-full font-mono text-xs"
            />
          </SettingsRow>
        </>
      )}

      {/* Search Engine Test Row */}
      <SettingsRow
        label={t("settings.chat.webSearch.testLabel")}
        description={t("settings.chat.webSearch.testDescription")}
      >
        <div className="flex flex-col gap-2 w-80 max-w-full">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder={t("settings.chat.webSearch.testQueryPlaceholder")}
              className="text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runTest();
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={runTest}
              disabled={testing || saving}
              className="gap-1.5 shrink-0"
            >
              {testing ? (
                <Spinner className="size-3.5" />
              ) : (
                <Play className="size-3.5 fill-current" />
              )}
              <span>{t("settings.chat.webSearch.runTest")}</span>
            </Button>
          </div>

          {testResult && (
            <div
              className={cn(
                "rounded-md border p-2.5 text-xs flex flex-col gap-1.5 animate-in fade-in duration-150",
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              <div className="flex items-center justify-between font-medium">
                <span>
                  {testResult.ok
                    ? t("settings.chat.webSearch.testSuccessStatus", {
                        count: testResult.results_count,
                      })
                    : t("settings.chat.webSearch.testFailedStatus")}
                </span>
              </div>
              {testResult.error && (
                <p className="text-[11px] text-destructive leading-snug">
                  {testResult.error}
                </p>
              )}
              {testResult.sample_results.length > 0 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-current/10">
                  {testResult.sample_results.map((res, idx) => (
                    <div key={idx} className="flex flex-col text-[11px]">
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline truncate hover:opacity-80"
                      >
                        {res.title || res.url}
                      </a>
                      <span className="text-[10px] opacity-80 truncate">
                        {res.snippet}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
