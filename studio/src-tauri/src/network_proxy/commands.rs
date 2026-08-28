// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

use super::chain_relay::get_chain_relay;
use super::component_updater::{
    check_component_update, perform_component_update, ComponentUpdateInfo,
};
use super::daemon_manager::get_daemon_manager;
use super::{
    apply_environment_proxies, get_effective_proxy_url, get_global_proxy_settings,
    save_proxy_settings_to_disk, DaemonStatus, NetworkProxySettings, ProxyTestResult, RoutingMode,
};
use std::time::Instant;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_network_proxy_settings() -> Result<NetworkProxySettings, String> {
    let settings = get_global_proxy_settings().lock().unwrap().clone();
    Ok(settings)
}

#[tauri::command]
pub async fn save_network_proxy_settings(
    settings: NetworkProxySettings,
) -> Result<(), String> {
    save_proxy_settings_to_disk(&settings)?;
    apply_environment_proxies(&settings);

    // Update in-memory state
    {
        let global_arc = get_global_proxy_settings();
        let mut global = global_arc.lock().unwrap();
        *global = settings.clone();
    }

    // Reconcile daemons
    let dm = get_daemon_manager();
    dm.reconcile(&settings);

    // Manage chain relay
    let relay = get_chain_relay();
    if settings.enabled && settings.routing_mode == RoutingMode::Chain {
        relay.start(settings.relay_port);
    } else {
        relay.stop();
    }

    Ok(())
}

#[tauri::command]
pub async fn get_network_daemon_statuses() -> Result<Vec<DaemonStatus>, String> {
    let settings = get_global_proxy_settings().lock().unwrap().clone();
    let dm = get_daemon_manager();
    Ok(dm.get_statuses(&settings))
}

#[tauri::command]
pub async fn test_proxy_connection(
    settings: Option<NetworkProxySettings>,
) -> Result<ProxyTestResult, String> {
    let effective_settings = match settings {
        Some(s) => s,
        None => get_global_proxy_settings().lock().unwrap().clone(),
    };

    let start = Instant::now();
    let mut builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(12));

    if let Some(proxy_url) = get_effective_proxy_url(&effective_settings) {
        let proxy = reqwest::Proxy::all(&proxy_url)
            .map_err(|e| format!("Invalid proxy URL '{proxy_url}': {e}"))?
            .no_proxy(Some(reqwest::NoProxy::from_string("localhost,127.0.0.1").unwrap()));
        builder = builder.proxy(proxy);
    }

    let client = builder.build().map_err(|e| e.to_string())?;

    // Try fetching IP & geo info
    match client.get("https://ipinfo.io/json").send().await {
        Ok(resp) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    let ip = json.get("ip").and_then(|v| v.as_str()).map(String::from);
                    let country = json
                        .get("country")
                        .and_then(|v| v.as_str())
                        .or_else(|| json.get("city").and_then(|v| v.as_str()))
                        .map(String::from);

                    return Ok(ProxyTestResult {
                        success: true,
                        ip,
                        country,
                        latency_ms: Some(latency_ms),
                        error: None,
                    });
                }
            }

            Ok(ProxyTestResult {
                success: true,
                ip: None,
                country: None,
                latency_ms: Some(latency_ms),
                error: None,
            })
        }
        Err(e) => Ok(ProxyTestResult {
            success: false,
            ip: None,
            country: None,
            latency_ms: None,
            error: Some(format!("Connection failed: {e}")),
        }),
    }
}

#[tauri::command]
pub async fn check_network_component_updates(
    component: String,
) -> Result<ComponentUpdateInfo, String> {
    check_component_update(&component).await
}

#[tauri::command]
pub async fn update_network_component(
    app: AppHandle,
    component: String,
) -> Result<String, String> {
    perform_component_update(&app, &component).await
}
