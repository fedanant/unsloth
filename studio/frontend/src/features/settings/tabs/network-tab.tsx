// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  checkNetworkComponentUpdates,
  type ComponentUpdateInfo,
  type DaemonStatus,
  DEFAULT_PROXY_SETTINGS,
  type DownloadProgressPayload,
  getNetworkDaemonStatuses,
  getNetworkProxySettings,
  listenToDownloadProgress,
  type NetworkProxySettings,
  type ProxyProtocol,
  type ProxyTestResult,
  saveNetworkProxySettings,
  testProxyConnection,
  updateNetworkComponent,
} from "../api/network-settings";
import { SettingsRow } from "../components/settings-row";
import { SettingsSection } from "../components/settings-section";

export function NetworkTab() {
  const [settings, setSettings] = useState<NetworkProxySettings>(
    DEFAULT_PROXY_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);
  const [daemonStatuses, setDaemonStatuses] = useState<DaemonStatus[]>([]);
  const [torUpdateInfo, setTorUpdateInfo] =
    useState<ComponentUpdateInfo | null>(null);
  const [i2pdUpdateInfo, setI2pdUpdateInfo] =
    useState<ComponentUpdateInfo | null>(null);
  const [checkingTorUpdate, setCheckingTorUpdate] = useState(false);
  const [checkingI2pdUpdate, setCheckingI2pdUpdate] = useState(false);
  const [updatingComponent, setUpdatingComponent] = useState<string | null>(
    null,
  );
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgressPayload | null>(null);

  // Load initial settings
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const loaded = await getNetworkProxySettings();
        if (mounted) {
          setSettings(loaded);
          setLoading(false);
        }
        const statuses = await getNetworkDaemonStatuses();
        if (mounted) {
          setDaemonStatuses(statuses);
        }
      } catch (err) {
        console.error("Failed to load proxy settings:", err);
        if (mounted) setLoading(false);
      }
    }
    load();

    // Listen to download progress
    let unlisten: (() => void) | undefined;
    listenToDownloadProgress((payload) => {
      setDownloadProgress(payload);
      if (payload.done) {
        setUpdatingComponent(null);
        toast("Компонент обновлен", {
          description: `${payload.component.toUpperCase()} успешно обновлен`,
        });
        getNetworkProxySettings().then(setSettings);
        getNetworkDaemonStatuses().then(setDaemonStatuses);
      }
    }).then((un) => {
      unlisten = un;
    });

    // Poll daemon statuses every 4 seconds
    const interval = setInterval(() => {
      getNetworkDaemonStatuses().then(setDaemonStatuses).catch(() => {});
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, []);

  const handleSave = async (newSettings: NetworkProxySettings) => {
    setSettings(newSettings);
    setSaving(true);
    try {
      await saveNetworkProxySettings(newSettings);
      const statuses = await getNetworkDaemonStatuses();
      setDaemonStatuses(statuses);
    } catch (err) {
      toast.error("Ошибка сохранения настроек", {
        description: String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testProxyConnection(settings);
      setTestResult(res);
      if (res.success) {
        toast("Соединение успешно", {
          description: `IP: ${res.ip || "OK"} | ${res.country || ""} (${res.latencyMs || 0} ms)`,
        });
      } else {
        toast.error("Ошибка соединения через прокси", {
          description: res.error || "Не удалось установить связь",
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCheckUpdate = async (comp: "tor" | "i2pd") => {
    if (comp === "tor") setCheckingTorUpdate(true);
    if (comp === "i2pd") setCheckingI2pdUpdate(true);
    try {
      const info = await checkNetworkComponentUpdates(comp);
      if (comp === "tor") setTorUpdateInfo(info);
      if (comp === "i2pd") setI2pdUpdateInfo(info);
      if (info.updateAvailable) {
        toast(`Доступно обновление для ${comp.toUpperCase()}`, {
          description: `Версия: ${info.latestVersion}`,
        });
      } else {
        toast(`${comp.toUpperCase()} актуален`, {
          description: `Установлена последняя версия (${info.latestVersion})`,
        });
      }
    } catch (err) {
      toast.error("Ошибка проверки обновления", {
        description: String(err),
      });
    } finally {
      if (comp === "tor") setCheckingTorUpdate(false);
      if (comp === "i2pd") setCheckingI2pdUpdate(false);
    }
  };

  const handlePerformUpdate = async (comp: "tor" | "i2pd") => {
    setUpdatingComponent(comp);
    try {
      await updateNetworkComponent(comp);
    } catch (err) {
      toast.error(`Ошибка обновления ${comp}`, {
        description: String(err),
      });
      setUpdatingComponent(null);
    }
  };

  const torStatus = daemonStatuses.find((d) => d.name === "tor");
  const i2pdStatus = daemonStatuses.find((d) => d.name === "i2pd");

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Main Switch */}
      <SettingsSection
        title="Сетевое Проксирование и Анонимность"
        description="Маршрутизация всего внешнего трафика приложения (Chromium, Rust reqwest, Python Hugging Face) через прокси и защищенные сети Tor / i2pd."
      >
        <SettingsRow
          label="Включить проксирование"
          description="Перенаправлять исходящий трафик через выбранный шлюз или цепочку"
        >
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) =>
              handleSave({ ...settings, enabled })
            }
          />
        </SettingsRow>
      </SettingsSection>

      {/* Routing Mode Selector */}
      <SettingsSection
        title="Режим маршрутизации"
        description="Выберите способ отправки трафика во внешнюю сеть"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4 my-2">
          {/* Custom Proxy */}
          <button
            type="button"
            disabled={!settings.enabled}
            onClick={() =>
              handleSave({ ...settings, routingMode: "customproxy" })
            }
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
              settings.routingMode === "customproxy"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 hover:border-border hover:bg-muted/40",
              !settings.enabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <Server className="h-4 w-4 text-primary" />
              {settings.routingMode === "customproxy" && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <span className="text-sm font-medium">Custom Proxy</span>
            <span className="text-[11px] text-muted-foreground">
              HTTP / HTTPS / SOCKS5
            </span>
          </button>

          {/* Tor */}
          <button
            type="button"
            disabled={!settings.enabled}
            onClick={() =>
              handleSave({ ...settings, routingMode: "tor" })
            }
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
              settings.routingMode === "tor"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 hover:border-border hover:bg-muted/40",
              !settings.enabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              {settings.routingMode === "tor" && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <span className="text-sm font-medium">Tor Network</span>
            <span className="text-[11px] text-muted-foreground">
              Луковая маршрутизация (:9050)
            </span>
          </button>

          {/* i2pd */}
          <button
            type="button"
            disabled={!settings.enabled}
            onClick={() =>
              handleSave({ ...settings, routingMode: "i2pd" })
            }
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
              settings.routingMode === "i2pd"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 hover:border-border hover:bg-muted/40",
              !settings.enabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <Network className="h-4 w-4 text-blue-500" />
              {settings.routingMode === "i2pd" && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <span className="text-sm font-medium">i2pd Network</span>
            <span className="text-[11px] text-muted-foreground">
              I2P Чесночный туннель (:4447)
            </span>
          </button>

          {/* Cascading Chain */}
          <button
            type="button"
            disabled={!settings.enabled}
            onClick={() =>
              handleSave({ ...settings, routingMode: "chain" })
            }
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
              settings.routingMode === "chain"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 hover:border-border hover:bg-muted/40",
              !settings.enabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <Zap className="h-4 w-4 text-amber-500" />
              {settings.routingMode === "chain" && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <span className="text-sm font-medium">Цепочка (Chain)</span>
            <span className="text-[11px] text-muted-foreground">
              Custom -&gt; i2pd -&gt; Tor
            </span>
          </button>
        </div>
      </SettingsSection>

      {/* Cascading Chain Visualizer */}
      {settings.routingMode === "chain" && (
        <div className="rounded-2xl border border-border/80 bg-muted/20 p-4.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">
                Конфигуратор цепочки шлюзов (Multi-hop)
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              Релей: 127.0.0.1:{settings.relayPort}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Трафик последовательно проходит через все включенные узлы перед выходом в интернет.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* Step 1: App */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Приложение</span>
            </div>

            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />

            {/* Step 2: Custom Proxy */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all",
                settings.chain.useCustomProxy
                  ? "border-primary/50 bg-primary/10 font-medium text-foreground"
                  : "border-border/40 bg-muted/40 text-muted-foreground line-through opacity-60",
              )}
            >
              <span>1. Custom Proxy</span>
              <Switch
                className="scale-75"
                checked={settings.chain.useCustomProxy}
                onCheckedChange={(val) =>
                  handleSave({
                    ...settings,
                    chain: { ...settings.chain, useCustomProxy: val },
                  })
                }
              />
            </div>

            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />

            {/* Step 3: i2pd */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all",
                settings.chain.useI2pd
                  ? "border-blue-500/50 bg-blue-500/10 font-medium text-foreground"
                  : "border-border/40 bg-muted/40 text-muted-foreground line-through opacity-60",
              )}
            >
              <span>2. i2pd Network</span>
              <Switch
                className="scale-75"
                checked={settings.chain.useI2pd}
                onCheckedChange={(val) =>
                  handleSave({
                    ...settings,
                    chain: { ...settings.chain, useI2pd: val },
                  })
                }
              />
            </div>

            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />

            {/* Step 4: Tor */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all",
                settings.chain.useTor
                  ? "border-emerald-500/50 bg-emerald-500/10 font-medium text-foreground"
                  : "border-border/40 bg-muted/40 text-muted-foreground line-through opacity-60",
              )}
            >
              <span>3. Tor Exit</span>
              <Switch
                className="scale-75"
                checked={settings.chain.useTor}
                onCheckedChange={(val) =>
                  handleSave({
                    ...settings,
                    chain: { ...settings.chain, useTor: val },
                  })
                }
              />
            </div>

            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />

            {/* Step 5: Internet */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-emerald-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Интернет</span>
            </div>
          </div>
        </div>
      )}

      {/* Custom Proxy Config */}
      {(settings.routingMode === "customproxy" ||
        (settings.routingMode === "chain" && settings.chain.useCustomProxy)) && (
        <SettingsSection
          title="Настройка пользовательского прокси"
          description="Параметры вашего внешнего HTTP / HTTPS / SOCKS5 прокси-сервера"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 my-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Протокол
              </label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={settings.customProxy.protocol}
                onChange={(e) =>
                  handleSave({
                    ...settings,
                    customProxy: {
                      ...settings.customProxy,
                      protocol: e.target.value as ProxyProtocol,
                      enabled: true,
                    },
                  })
                }
              >
                <option value="socks5h">SOCKS5h (DNS через прокси)</option>
                <option value="socks5">SOCKS5</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Хост / IP
              </label>
              <Input
                className="mt-1"
                placeholder="127.0.0.1"
                value={settings.customProxy.host}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    customProxy: {
                      ...settings.customProxy,
                      host: e.target.value,
                      enabled: true,
                    },
                  })
                }
                onBlur={() => handleSave(settings)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Порт
              </label>
              <Input
                className="mt-1"
                type="number"
                placeholder="1080"
                value={settings.customProxy.port}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    customProxy: {
                      ...settings.customProxy,
                      port: parseInt(e.target.value, 10) || 1080,
                      enabled: true,
                    },
                  })
                }
                onBlur={() => handleSave(settings)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Логин (опционально)
              </label>
              <Input
                className="mt-1"
                placeholder="username"
                value={settings.customProxy.username || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    customProxy: {
                      ...settings.customProxy,
                      username: e.target.value || null,
                    },
                  })
                }
                onBlur={() => handleSave(settings)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Пароль (опционально)
              </label>
              <Input
                className="mt-1"
                type="password"
                placeholder="••••••••"
                value={settings.customProxy.password || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    customProxy: {
                      ...settings.customProxy,
                      password: e.target.value || null,
                    },
                  })
                }
                onBlur={() => handleSave(settings)}
              />
            </div>
          </div>
        </SettingsSection>
      )}

      {/* Built-in Tor Section */}
      <SettingsSection
        title="Встроенная сеть Tor (Built-in)"
        description="Защищенная луковая маршрутизация с анонимизацией выходного IP и защитой от перехвата."
      >
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 p-3.5 my-1 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  torStatus?.running ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-sm font-semibold">Tor Daemon</span>
              <span className="text-xs text-muted-foreground">
                {torStatus?.running
                  ? `Активен на 127.0.0.1:${settings.tor.socksPort}`
                  : "Остановлен"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={checkingTorUpdate || updatingComponent === "tor"}
                onClick={() => handleCheckUpdate("tor")}
              >
                {checkingTorUpdate ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span>Проверить обновление</span>
              </Button>

              {torUpdateInfo?.updateAvailable && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                  disabled={updatingComponent === "tor"}
                  onClick={() => handlePerformUpdate("tor")}
                >
                  {updatingComponent === "tor" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  <span>Обновить до v{torUpdateInfo.latestVersion}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Download progress bar */}
          {updatingComponent === "tor" && downloadProgress && (
            <div className="flex flex-col gap-1 pt-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Загрузка Tor Expert Bundle...</span>
                <span>{Math.round(downloadProgress.percentage)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${downloadProgress.percentage}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
            <span>
              Установленная версия:{" "}
              <strong className="text-foreground">
                {settings.tor.installedVersion || "Встроенная (0.4.8.x)"}
              </strong>
            </span>
            <span>SOCKS5 порт: {settings.tor.socksPort}</span>
          </div>
        </div>
      </SettingsSection>

      {/* Built-in i2pd Section */}
      <SettingsSection
        title="Встроенная сеть i2pd (Built-in)"
        description="Распределенная чесночная сеть I2P для работы внутри скрытых сервисов и через outproxy шлюзы."
      >
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 p-3.5 my-1 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  i2pdStatus?.running ? "bg-blue-500 animate-pulse" : "bg-muted-foreground/40",
                )}
              />
              <span className="text-sm font-semibold">i2pd Daemon</span>
              <span className="text-xs text-muted-foreground">
                {i2pdStatus?.running
                  ? `Активен на SOCKS :${settings.i2pd.socksProxyPort} / HTTP :${settings.i2pd.httpProxyPort}`
                  : "Остановлен"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={checkingI2pdUpdate || updatingComponent === "i2pd"}
                onClick={() => handleCheckUpdate("i2pd")}
              >
                {checkingI2pdUpdate ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span>Проверить обновление</span>
              </Button>

              {i2pdUpdateInfo?.updateAvailable && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
                  disabled={updatingComponent === "i2pd"}
                  onClick={() => handlePerformUpdate("i2pd")}
                >
                  {updatingComponent === "i2pd" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  <span>Обновить до v{i2pdUpdateInfo.latestVersion}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Download progress bar */}
          {updatingComponent === "i2pd" && downloadProgress && (
            <div className="flex flex-col gap-1 pt-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Загрузка i2pd бинарника...</span>
                <span>{Math.round(downloadProgress.percentage)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${downloadProgress.percentage}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
            <span>
              Установленная версия:{" "}
              <strong className="text-foreground">
                {settings.i2pd.installedVersion || "Встроенная (2.53.x)"}
              </strong>
            </span>
            <span>SOCKS порт: {settings.i2pd.socksProxyPort}</span>
          </div>
        </div>
      </SettingsSection>

      {/* Test Connection Card */}
      <SettingsSection
        title="Диагностика и проверка соединения"
        description="Проверьте работу текущей схемы проксирования и определите внешний IP-адрес выхода."
      >
        <div className="rounded-xl border border-border/70 p-4 bg-muted/10 flex flex-col gap-3 my-1">
          <div className="flex items-center justify-between">
            <Button
              className="gap-2"
              disabled={testing || !settings.enabled}
              onClick={handleTestConnection}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              <span>Проверить соединение через прокси</span>
            </Button>

            {testResult && (
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Подключение успешно ({testResult.latencyMs} ms)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                    <AlertCircle className="h-4 w-4" />
                    <span>Сбой соединения</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {testResult?.success && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-border/40 text-xs">
              <div>
                <span className="text-muted-foreground">Внешний IP:</span>{" "}
                <strong className="font-mono text-foreground">{testResult.ip || "Скрыт"}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Локация выхода:</span>{" "}
                <strong className="text-foreground">{testResult.country || "Tor/Proxy Network"}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Задержка:</span>{" "}
                <strong className="text-foreground">{testResult.latencyMs} ms</strong>
              </div>
            </div>
          )}

          {testResult?.error && (
            <p className="text-xs text-destructive pt-1 border-t border-border/40 font-mono">
              {testResult.error}
            </p>
          )}
        </div>
      </SettingsSection>

      {/* Bypass Exceptions */}
      <SettingsSection
        title="Исключения проксирования (Bypass List)"
        description="Адреса и хосты, запросы к которым отправляются напрямую минуя прокси."
      >
        <div className="flex flex-col gap-2 my-1">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>
              Системные исключения (зафиксированы):{" "}
              <strong className="text-foreground">localhost, 127.0.0.1, ::1</strong>{" "}
              (необходимы для внутреннего взаимодействия UI и бэкенда).
            </span>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Дополнительные домены (через запятую):
            </label>
            <Input
              className="mt-1"
              placeholder="*.local, internal.corp"
              value={settings.bypassHosts
                .filter((h: string) => !["localhost", "127.0.0.1", "::1"].includes(h))
                .join(", ")}
              onChange={(e) => {
                const custom = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                handleSave({
                  ...settings,
                  bypassHosts: ["localhost", "127.0.0.1", "::1", ...custom],
                });
              }}
            />
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
