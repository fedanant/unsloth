// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { isTauri } from "@/lib/api-base";

export type ProxyProtocol = "http" | "https" | "socks5" | "socks5h";
export type TorMode = "builtin" | "custom";
export type I2pdMode = "builtin" | "custom";
export type RoutingMode = "direct" | "customproxy" | "tor" | "i2pd" | "chain";

export interface CustomProxyConfig {
  enabled: boolean;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface TorConfig {
  enabled: boolean;
  mode: TorMode;
  socksPort: number;
  installedVersion?: string | null;
}

export interface I2pdConfig {
  enabled: boolean;
  mode: I2pdMode;
  httpProxyPort: number;
  socksProxyPort: number;
  installedVersion?: string | null;
}

export interface ChainConfig {
  useCustomProxy: boolean;
  useI2pd: boolean;
  useTor: boolean;
  order: string[];
}

export interface NetworkProxySettings {
  enabled: boolean;
  routingMode: RoutingMode;
  customProxy: CustomProxyConfig;
  tor: TorConfig;
  i2pd: I2pdConfig;
  chain: ChainConfig;
  bypassHosts: string[];
  relayPort: number;
}

export interface ProxyTestResult {
  success: boolean;
  ip?: string | null;
  country?: string | null;
  latencyMs?: number | null;
  error?: string | null;
}

export interface DaemonStatus {
  name: string;
  running: boolean;
  port: number;
  version?: string | null;
  error?: string | null;
}

export interface ComponentUpdateInfo {
  component: string;
  currentVersion?: string | null;
  latestVersion: string;
  updateAvailable: boolean;
  downloadUrl: string;
  releaseNotes?: string | null;
  sizeBytes?: number | null;
}

export interface DownloadProgressPayload {
  component: string;
  downloadedBytes: number;
  totalBytes?: number | null;
  percentage: number;
  done: boolean;
  error?: string | null;
}

export const DEFAULT_PROXY_SETTINGS: NetworkProxySettings = {
  enabled: false,
  routingMode: "direct",
  customProxy: {
    enabled: false,
    protocol: "socks5h",
    host: "127.0.0.1",
    port: 1080,
    username: null,
    password: null,
  },
  tor: {
    enabled: false,
    mode: "builtin",
    socksPort: 9050,
    installedVersion: null,
  },
  i2pd: {
    enabled: false,
    mode: "builtin",
    httpProxyPort: 4444,
    socksProxyPort: 4447,
    installedVersion: null,
  },
  chain: {
    useCustomProxy: true,
    useI2pd: true,
    useTor: true,
    order: ["custom_proxy", "i2pd", "tor"],
  },
  bypassHosts: ["localhost", "127.0.0.1", "::1", "*.local"],
  relayPort: 9999,
};

export async function getNetworkProxySettings(): Promise<NetworkProxySettings> {
  if (!isTauri) {
    return DEFAULT_PROXY_SETTINGS;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<NetworkProxySettings>("get_network_proxy_settings");
}

export async function saveNetworkProxySettings(
  settings: NetworkProxySettings,
): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<void>("save_network_proxy_settings", { settings });
}

export async function getNetworkDaemonStatuses(): Promise<DaemonStatus[]> {
  if (!isTauri) {
    return [
      { name: "tor", running: false, port: 9050 },
      { name: "i2pd", running: false, port: 4447 },
      { name: "relay", running: false, port: 9999 },
    ];
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DaemonStatus[]>("get_network_daemon_statuses");
}

export async function testProxyConnection(
  settings?: NetworkProxySettings,
): Promise<ProxyTestResult> {
  if (!isTauri) {
    return {
      success: true,
      ip: "127.0.0.1 (Web Preview)",
      country: "Local",
      latencyMs: 12,
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProxyTestResult>("test_proxy_connection", { settings });
}

export async function checkNetworkComponentUpdates(
  component: "tor" | "i2pd",
): Promise<ComponentUpdateInfo> {
  if (!isTauri) {
    return {
      component,
      latestVersion: component === "tor" ? "0.4.8.14" : "2.53.0",
      updateAvailable: false,
      downloadUrl: "",
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ComponentUpdateInfo>("check_network_component_updates", {
    component,
  });
}

export async function updateNetworkComponent(
  component: "tor" | "i2pd",
): Promise<string> {
  if (!isTauri) return "Mock updated";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("update_network_component", { component });
}

export async function listenToDownloadProgress(
  callback: (payload: DownloadProgressPayload) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<DownloadProgressPayload>(
    "network:download-progress",
    (event) => callback(event.payload),
  );
  return unlisten;
}
