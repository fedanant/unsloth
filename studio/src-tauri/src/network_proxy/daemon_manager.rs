// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

use super::{
    app_bin_dir, app_config_dir, DaemonStatus, I2pdMode, NetworkProxySettings, RoutingMode,
    TorMode,
};
use log::{error, info, warn};
use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

#[derive(Default)]
struct ActiveDaemons {
    tor_child: Option<Child>,
    tor_port: u16,
    i2pd_child: Option<Child>,
    i2pd_socks_port: u16,
    i2pd_http_port: u16,
}

pub struct DaemonManager {
    inner: Arc<Mutex<ActiveDaemons>>,
}

static DAEMON_MANAGER: OnceLock<DaemonManager> = OnceLock::new();

pub fn get_daemon_manager() -> &'static DaemonManager {
    DAEMON_MANAGER.get_or_init(|| DaemonManager {
        inner: Arc::new(Mutex::new(ActiveDaemons::default())),
    })
}

impl DaemonManager {
    pub fn tor_binary_path() -> PathBuf {
        let bin_dir = app_bin_dir();
        #[cfg(windows)]
        let path = bin_dir.join("tor.exe");
        #[cfg(not(windows))]
        let path = bin_dir.join("tor");
        path
    }

    pub fn i2pd_binary_path() -> PathBuf {
        let bin_dir = app_bin_dir();
        #[cfg(windows)]
        let path = bin_dir.join("i2pd.exe");
        #[cfg(not(windows))]
        let path = bin_dir.join("i2pd");
        path
    }

    pub fn tor_data_dir() -> PathBuf {
        app_config_dir().join("tor-data")
    }

    pub fn i2pd_data_dir() -> PathBuf {
        app_config_dir().join("i2pd-data")
    }

    pub fn is_port_listening(port: u16) -> bool {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
    }

    pub fn reconcile(&self, settings: &NetworkProxySettings) {
        let needs_tor = settings.enabled
            && (settings.routing_mode == RoutingMode::Tor
                || (settings.routing_mode == RoutingMode::Chain && settings.chain.use_tor));

        let needs_i2pd = settings.enabled
            && (settings.routing_mode == RoutingMode::I2pd
                || (settings.routing_mode == RoutingMode::Chain && settings.chain.use_i2pd));

        if needs_tor && settings.tor.mode == TorMode::Builtin {
            self.ensure_tor_running(settings.tor.socks_port);
        } else {
            self.stop_tor();
        }

        if needs_i2pd && settings.i2pd.mode == I2pdMode::Builtin {
            self.ensure_i2pd_running(settings.i2pd.http_proxy_port, settings.i2pd.socks_proxy_port);
        } else {
            self.stop_i2pd();
        }
    }

    pub fn ensure_tor_running(&self, socks_port: u16) {
        let mut daemons = self.inner.lock().unwrap();

        if let Some(child) = daemons.tor_child.as_mut() {
            if let Ok(None) = child.try_wait() {
                if daemons.tor_port == socks_port {
                    return; // Already running with the right port
                }
            }
        }

        // Check if something is already listening
        if Self::is_port_listening(socks_port) {
            info!("Tor SOCKS port {socks_port} is already listening.");
            daemons.tor_port = socks_port;
            return;
        }

        let binary = Self::tor_binary_path();
        if !binary.exists() {
            warn!(
                "Tor binary not found at {}. Tor daemon cannot start until binary is downloaded.",
                binary.display()
            );
            return;
        }

        let data_dir = Self::tor_data_dir();
        let _ = fs::create_dir_all(&data_dir);
        let torrc_path = data_dir.join("torrc");

        let torrc_content = format!(
            "SocksPort 127.0.0.1:{socks_port}\nDataDirectory {}\nAvoidDiskWrites 1\n",
            data_dir.display()
        );
        let _ = fs::write(&torrc_path, torrc_content);

        info!("Starting Tor daemon from {} on port {socks_port}", binary.display());
        let mut cmd = Command::new(&binary);
        cmd.arg("-f").arg(&torrc_path);
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child) => {
                info!("Tor daemon spawned with PID {:?}", child.id());
                daemons.tor_child = Some(child);
                daemons.tor_port = socks_port;
            }
            Err(e) => {
                error!("Failed to spawn Tor daemon: {e}");
            }
        }
    }

    pub fn stop_tor(&self) {
        let mut daemons = self.inner.lock().unwrap();
        if let Some(mut child) = daemons.tor_child.take() {
            info!("Stopping Tor daemon PID {:?}", child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn ensure_i2pd_running(&self, http_port: u16, socks_port: u16) {
        let mut daemons = self.inner.lock().unwrap();

        if let Some(child) = daemons.i2pd_child.as_mut() {
            if let Ok(None) = child.try_wait() {
                if daemons.i2pd_socks_port == socks_port && daemons.i2pd_http_port == http_port {
                    return; // Already running with the right ports
                }
            }
        }

        if Self::is_port_listening(socks_port) || Self::is_port_listening(http_port) {
            info!("i2pd port is already listening.");
            daemons.i2pd_socks_port = socks_port;
            daemons.i2pd_http_port = http_port;
            return;
        }

        let binary = Self::i2pd_binary_path();
        if !binary.exists() {
            warn!(
                "i2pd binary not found at {}. i2pd daemon cannot start until binary is downloaded.",
                binary.display()
            );
            return;
        }

        let data_dir = Self::i2pd_data_dir();
        let _ = fs::create_dir_all(&data_dir);
        let conf_path = data_dir.join("i2pd.conf");

        let conf_content = format!(
            "datadir = {}\ndaemon = false\nipv6 = false\n[http]\nenabled = false\n[httpproxy]\nenabled = true\naddress = 127.0.0.1\nport = {http_port}\n[socksproxy]\nenabled = true\naddress = 127.0.0.1\nport = {socks_port}\noutproxy = false\n",
            data_dir.display()
        );
        let _ = fs::write(&conf_path, conf_content);

        info!("Starting i2pd daemon from {} on SOCKS port {socks_port}", binary.display());
        let mut cmd = Command::new(&binary);
        cmd.arg(format!("--conf={}", conf_path.display()));
        cmd.arg(format!("--datadir={}", data_dir.display()));
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child) => {
                info!("i2pd daemon spawned with PID {:?}", child.id());
                daemons.i2pd_child = Some(child);
                daemons.i2pd_socks_port = socks_port;
                daemons.i2pd_http_port = http_port;
            }
            Err(e) => {
                error!("Failed to spawn i2pd daemon: {e}");
            }
        }
    }

    pub fn stop_i2pd(&self) {
        let mut daemons = self.inner.lock().unwrap();
        if let Some(mut child) = daemons.i2pd_child.take() {
            info!("Stopping i2pd daemon PID {:?}", child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn stop_all(&self) {
        self.stop_tor();
        self.stop_i2pd();
    }

    pub fn get_statuses(&self, settings: &NetworkProxySettings) -> Vec<DaemonStatus> {
        let tor_running = Self::is_port_listening(settings.tor.socks_port);
        let i2pd_running = Self::is_port_listening(settings.i2pd.socks_proxy_port);
        let relay_running = Self::is_port_listening(settings.relay_port);

        vec![
            DaemonStatus {
                name: "tor".to_string(),
                running: tor_running,
                port: settings.tor.socks_port,
                version: settings.tor.installed_version.clone(),
                error: if !tor_running && settings.enabled && settings.tor.enabled {
                    Some("Tor daemon is not responding on SOCKS port".to_string())
                } else {
                    None
                },
            },
            DaemonStatus {
                name: "i2pd".to_string(),
                running: i2pd_running,
                port: settings.i2pd.socks_proxy_port,
                version: settings.i2pd.installed_version.clone(),
                error: if !i2pd_running && settings.enabled && settings.i2pd.enabled {
                    Some("i2pd daemon is not responding on SOCKS port".to_string())
                } else {
                    None
                },
            },
            DaemonStatus {
                name: "relay".to_string(),
                running: relay_running,
                port: settings.relay_port,
                version: None,
                error: None,
            },
        ]
    }
}
