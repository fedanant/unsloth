// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

pub mod chain_relay;
pub mod commands;
pub mod component_updater;
pub mod daemon_manager;

use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

const NETWORK_PROXY_SETTINGS_FILE: &str = "network-proxy-v1.json";
pub const DEFAULT_RELAY_PORT: u16 = 9999;
pub const DEFAULT_TOR_SOCKS_PORT: u16 = 9050;
pub const DEFAULT_I2PD_HTTP_PORT: u16 = 4444;
pub const DEFAULT_I2PD_SOCKS_PORT: u16 = 4447;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyProtocol {
    Http,
    Https,
    Socks5,
    Socks5h,
}

impl Default for ProxyProtocol {
    fn default() -> Self {
        Self::Socks5h
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomProxyConfig {
    pub enabled: bool,
    pub protocol: ProxyProtocol,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

impl Default for CustomProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            protocol: ProxyProtocol::Socks5h,
            host: "127.0.0.1".to_string(),
            port: 1080,
            username: None,
            password: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TorMode {
    Builtin,
    Custom,
}

impl Default for TorMode {
    fn default() -> Self {
        Self::Builtin
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TorConfig {
    pub enabled: bool,
    pub mode: TorMode,
    pub socks_port: u16,
    pub installed_version: Option<String>,
}

impl Default for TorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: TorMode::Builtin,
            socks_port: DEFAULT_TOR_SOCKS_PORT,
            installed_version: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum I2pdMode {
    Builtin,
    Custom,
}

impl Default for I2pdMode {
    fn default() -> Self {
        Self::Builtin
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct I2pdConfig {
    pub enabled: bool,
    pub mode: I2pdMode,
    pub http_proxy_port: u16,
    pub socks_proxy_port: u16,
    pub installed_version: Option<String>,
}

impl Default for I2pdConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: I2pdMode::Builtin,
            http_proxy_port: DEFAULT_I2PD_HTTP_PORT,
            socks_proxy_port: DEFAULT_I2PD_SOCKS_PORT,
            installed_version: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RoutingMode {
    Direct,
    CustomProxy,
    Tor,
    I2pd,
    Chain,
}

impl Default for RoutingMode {
    fn default() -> Self {
        Self::Direct
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChainConfig {
    pub use_custom_proxy: bool,
    pub use_i2pd: bool,
    pub use_tor: bool,
    pub order: Vec<String>,
}

impl Default for ChainConfig {
    fn default() -> Self {
        Self {
            use_custom_proxy: true,
            use_i2pd: true,
            use_tor: true,
            order: vec![
                "custom_proxy".to_string(),
                "i2pd".to_string(),
                "tor".to_string(),
            ],
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxySettings {
    pub enabled: bool,
    pub routing_mode: RoutingMode,
    pub custom_proxy: CustomProxyConfig,
    pub tor: TorConfig,
    pub i2pd: I2pdConfig,
    pub chain: ChainConfig,
    pub bypass_hosts: Vec<String>,
    pub relay_port: u16,
}

impl Default for NetworkProxySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            routing_mode: RoutingMode::Direct,
            custom_proxy: CustomProxyConfig::default(),
            tor: TorConfig::default(),
            i2pd: I2pdConfig::default(),
            chain: ChainConfig::default(),
            bypass_hosts: vec![
                "localhost".to_string(),
                "127.0.0.1".to_string(),
                "::1".to_string(),
                "*.local".to_string(),
            ],
            relay_port: DEFAULT_RELAY_PORT,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyTestResult {
    pub success: bool,
    pub ip: Option<String>,
    pub country: Option<String>,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub name: String,
    pub running: bool,
    pub port: u16,
    pub version: Option<String>,
    pub error: Option<String>,
}

pub type SharedProxySettings = Arc<Mutex<NetworkProxySettings>>;

static GLOBAL_PROXY_SETTINGS: OnceLock<SharedProxySettings> = OnceLock::new();

pub fn get_global_proxy_settings() -> SharedProxySettings {
    GLOBAL_PROXY_SETTINGS
        .get_or_init(|| {
            let loaded = load_proxy_settings_from_disk();
            Arc::new(Mutex::new(loaded))
        })
        .clone()
}

pub fn app_config_dir() -> PathBuf {
    if let Some(mut dir) = dirs::config_dir() {
        dir.push("ai.unsloth.studio");
        dir
    } else {
        PathBuf::from(".")
    }
}

pub fn app_bin_dir() -> PathBuf {
    let mut dir = app_config_dir();
    dir.push("bin");
    dir
}

pub fn proxy_settings_path() -> PathBuf {
    app_config_dir().join(NETWORK_PROXY_SETTINGS_FILE)
}

pub fn load_proxy_settings_from_disk() -> NetworkProxySettings {
    let path = proxy_settings_path();
    if !path.exists() {
        return NetworkProxySettings::default();
    }
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<NetworkProxySettings>(&content) {
            Ok(settings) => settings,
            Err(e) => {
                warn!("Failed to parse proxy settings from {}: {e}", path.display());
                NetworkProxySettings::default()
            }
        },
        Err(e) => {
            warn!("Failed to read proxy settings from {}: {e}", path.display());
            NetworkProxySettings::default()
        }
    }
}

pub fn save_proxy_settings_to_disk(settings: &NetworkProxySettings) -> Result<(), String> {
    let config_dir = app_config_dir();
    fs::create_dir_all(&config_dir).map_err(|e| {
        format!(
            "Failed to create directory {}: {e}",
            config_dir.display()
        )
    })?;

    let path = proxy_settings_path();
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize proxy settings: {e}"))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write proxy settings to {}: {e}", path.display()))?;

    info!("Saved network proxy settings to {}", path.display());
    Ok(())
}

/// Computes the effective proxy URL that other layers (Rust reqwest, Chrome WebView, Python) should target.
pub fn get_effective_proxy_url(settings: &NetworkProxySettings) -> Option<String> {
    if !settings.enabled {
        return None;
    }

    match settings.routing_mode {
        RoutingMode::Direct => None,
        RoutingMode::CustomProxy => {
            let cp = &settings.custom_proxy;
            let proto = match cp.protocol {
                ProxyProtocol::Http => "http",
                ProxyProtocol::Https => "https",
                ProxyProtocol::Socks5 => "socks5",
                ProxyProtocol::Socks5h => "socks5h",
            };
            if let (Some(u), Some(p)) = (&cp.username, &cp.password) {
                if !u.is_empty() {
                    return Some(format!("{proto}://{u}:{p}@{}:{}", cp.host, cp.port));
                }
            }
            Some(format!("{proto}://{}:{}", cp.host, cp.port))
        }
        RoutingMode::Tor => {
            Some(format!("socks5h://127.0.0.1:{}", settings.tor.socks_port))
        }
        RoutingMode::I2pd => {
            Some(format!("http://127.0.0.1:{}", settings.i2pd.http_proxy_port))
        }
        RoutingMode::Chain => {
            // Target the local chain relay
            Some(format!("socks5h://127.0.0.1:{}", settings.relay_port))
        }
    }
}

/// Configures environment variables for the current process and child processes.
pub fn apply_environment_proxies(settings: &NetworkProxySettings) {
    if let Some(proxy_url) = get_effective_proxy_url(settings) {
        info!("Applying proxy environment variables: {proxy_url}");
        std::env::set_var("HTTP_PROXY", &proxy_url);
        std::env::set_var("HTTPS_PROXY", &proxy_url);
        std::env::set_var("ALL_PROXY", &proxy_url);
        std::env::set_var("http_proxy", &proxy_url);
        std::env::set_var("https_proxy", &proxy_url);
        std::env::set_var("all_proxy", &proxy_url);

        let bypass = settings.bypass_hosts.join(",");
        std::env::set_var("NO_PROXY", &bypass);
        std::env::set_var("no_proxy", &bypass);

        // Configure WebView2 arguments for Chromium on Windows
        #[cfg(windows)]
        {
            let webview_proxy_arg = format!(
                "--proxy-server=\"{}\" --proxy-bypass-list=\"<-loopback>;127.0.0.1;localhost\"",
                proxy_url
            );
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", webview_proxy_arg);
        }
    } else {
        std::env::remove_var("HTTP_PROXY");
        std::env::remove_var("HTTPS_PROXY");
        std::env::remove_var("ALL_PROXY");
        std::env::remove_var("http_proxy");
        std::env::remove_var("https_proxy");
        std::env::remove_var("all_proxy");
        std::env::remove_var("NO_PROXY");
        std::env::remove_var("no_proxy");
        #[cfg(windows)]
        {
            std::env::remove_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
        }
    }
}
