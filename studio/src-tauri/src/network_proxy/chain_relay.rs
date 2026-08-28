// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

use super::{get_global_proxy_settings, NetworkProxySettings, RoutingMode};
use log::{error, info, warn};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Notify;

pub struct ChainRelay {
    running: Arc<AtomicBool>,
    shutdown_notify: Arc<Notify>,
}

static RELAY_INSTANCE: std::sync::OnceLock<ChainRelay> = std::sync::OnceLock::new();

pub fn get_chain_relay() -> &'static ChainRelay {
    RELAY_INSTANCE.get_or_init(|| ChainRelay {
        running: Arc::new(AtomicBool::new(false)),
        shutdown_notify: Arc::new(Notify::new()),
    })
}

impl ChainRelay {
    #[allow(dead_code)]
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn start(&self, port: u16) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // Already running
        }

        let running_flag = self.running.clone();
        let shutdown_notify = self.shutdown_notify.clone();

        tokio::spawn(async move {
            let addr = SocketAddr::from(([127, 0, 0, 1], port));
            let listener = match TcpListener::bind(addr).await {
                Ok(l) => {
                    info!("Chain relay SOCKS proxy listening on {addr}");
                    l
                }
                Err(e) => {
                    error!("Failed to bind chain relay on {addr}: {e}");
                    running_flag.store(false, Ordering::SeqCst);
                    return;
                }
            };

            loop {
                tokio::select! {
                    accept_res = listener.accept() => {
                        match accept_res {
                            Ok((stream, client_addr)) => {
                                tokio::spawn(async move {
                                    if let Err(e) = handle_socks5_client(stream).await {
                                        warn!("Relay connection error from {client_addr}: {e}");
                                    }
                                });
                            }
                            Err(e) => {
                                warn!("Accept error on relay listener: {e}");
                            }
                        }
                    }
                    _ = shutdown_notify.notified() => {
                        info!("Shutting down chain relay listener on {addr}");
                        break;
                    }
                }
            }

            running_flag.store(false, Ordering::SeqCst);
        });
    }

    pub fn stop(&self) {
        if self.running.load(Ordering::SeqCst) {
            self.shutdown_notify.notify_waiters();
        }
    }
}

async fn handle_socks5_client(mut client: TcpStream) -> Result<(), String> {
    // 1. Handshake greeting
    let mut header = [0u8; 2];
    client
        .read_exact(&mut header)
        .await
        .map_err(|e| format!("Read greeting error: {e}"))?;

    if header[0] != 0x05 {
        return Err(format!("Unsupported SOCKS version: {}", header[0]));
    }

    let nmethods = header[1] as usize;
    let mut methods = vec![0u8; nmethods];
    client
        .read_exact(&mut methods)
        .await
        .map_err(|e| format!("Read methods error: {e}"))?;

    // Respond: SOCKS5, NO AUTH (0x00)
    client
        .write_all(&[0x05, 0x00])
        .await
        .map_err(|e| format!("Write auth error: {e}"))?;

    // 2. Request
    let mut req_header = [0u8; 4];
    client
        .read_exact(&mut req_header)
        .await
        .map_err(|e| format!("Read request header error: {e}"))?;

    let cmd = req_header[1];
    let atyp = req_header[3];

    if cmd != 0x01 {
        // 0x01 = CONNECT
        let _ = client
            .write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            .await;
        return Err(format!("Command not supported: {cmd}"));
    }

    let (target_host, target_port) = match atyp {
        0x01 => {
            // IPv4 (4 bytes)
            let mut ip = [0u8; 4];
            client
                .read_exact(&mut ip)
                .await
                .map_err(|e| format!("Read IPv4 error: {e}"))?;
            let mut port_bytes = [0u8; 2];
            client
                .read_exact(&mut port_bytes)
                .await
                .map_err(|e| format!("Read port error: {e}"))?;
            let port = u16::from_be_bytes(port_bytes);
            (
                format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]),
                port,
            )
        }
        0x03 => {
            // Domain name
            let mut len = [0u8; 1];
            client
                .read_exact(&mut len)
                .await
                .map_err(|e| format!("Read domain len error: {e}"))?;
            let mut domain = vec![0u8; len[0] as usize];
            client
                .read_exact(&mut domain)
                .await
                .map_err(|e| format!("Read domain error: {e}"))?;
            let domain_str = String::from_utf8_lossy(&domain).to_string();
            let mut port_bytes = [0u8; 2];
            client
                .read_exact(&mut port_bytes)
                .await
                .map_err(|e| format!("Read port error: {e}"))?;
            let port = u16::from_be_bytes(port_bytes);
            (domain_str, port)
        }
        0x04 => {
            // IPv6
            let mut ip = [0u8; 16];
            client
                .read_exact(&mut ip)
                .await
                .map_err(|e| format!("Read IPv6 error: {e}"))?;
            let mut port_bytes = [0u8; 2];
            client
                .read_exact(&mut port_bytes)
                .await
                .map_err(|e| format!("Read port error: {e}"))?;
            let port = u16::from_be_bytes(port_bytes);
            (
                format!(
                    "{:x}:{:x}:{:x}:{:x}:{:x}:{:x}:{:x}:{:x}",
                    u16::from_be_bytes([ip[0], ip[1]]),
                    u16::from_be_bytes([ip[2], ip[3]]),
                    u16::from_be_bytes([ip[4], ip[5]]),
                    u16::from_be_bytes([ip[6], ip[7]]),
                    u16::from_be_bytes([ip[8], ip[9]]),
                    u16::from_be_bytes([ip[10], ip[11]]),
                    u16::from_be_bytes([ip[12], ip[13]]),
                    u16::from_be_bytes([ip[14], ip[15]]),
                ),
                port,
            )
        }
        _ => {
            let _ = client
                .write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await;
            return Err(format!("Address type not supported: {atyp}"));
        }
    };

    // 3. Connect via chain
    let settings_arc = get_global_proxy_settings();
    let settings = settings_arc.lock().unwrap().clone();

    let mut upstream = connect_through_chain(&settings, &target_host, target_port).await?;

    // Respond success to client
    client
        .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        .await
        .map_err(|e| format!("Write success response error: {e}"))?;

    // 4. Bi-directional piping
    let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
    Ok(())
}

async fn connect_through_chain(
    settings: &NetworkProxySettings,
    target_host: &str,
    target_port: u16,
) -> Result<TcpStream, String> {
    // Build list of active hops
    let mut hops: Vec<(String, u16)> = Vec::new();

    if settings.routing_mode == RoutingMode::Chain {
        for node in &settings.chain.order {
            match node.as_str() {
                "custom_proxy" if settings.chain.use_custom_proxy && settings.custom_proxy.enabled => {
                    hops.push((settings.custom_proxy.host.clone(), settings.custom_proxy.port));
                }
                "i2pd" if settings.chain.use_i2pd && settings.i2pd.enabled => {
                    hops.push(("127.0.0.1".to_string(), settings.i2pd.socks_proxy_port));
                }
                "tor" if settings.chain.use_tor && settings.tor.enabled => {
                    hops.push(("127.0.0.1".to_string(), settings.tor.socks_port));
                }
                _ => {}
            }
        }
    } else if settings.routing_mode == RoutingMode::Tor {
        hops.push(("127.0.0.1".to_string(), settings.tor.socks_port));
    } else if settings.routing_mode == RoutingMode::I2pd {
        hops.push(("127.0.0.1".to_string(), settings.i2pd.socks_proxy_port));
    } else if settings.routing_mode == RoutingMode::CustomProxy {
        hops.push((settings.custom_proxy.host.clone(), settings.custom_proxy.port));
    }

    if hops.is_empty() {
        // Direct connection
        let direct_addr = format!("{target_host}:{target_port}");
        return TcpStream::connect(direct_addr)
            .await
            .map_err(|e| format!("Direct connection to {target_host}:{target_port} failed: {e}"));
    }

    // Connect to first hop
    let first = &hops[0];
    let mut current_stream = TcpStream::connect(format!("{}:{}", first.0, first.1))
        .await
        .map_err(|e| format!("Failed to connect to first hop {}:{}: {e}", first.0, first.1))?;

    // Chain through remaining hops
    for hop in hops.iter().skip(1) {
        socks5_handshake_and_connect(&mut current_stream, &hop.0, hop.1).await?;
    }

    // Final connection to target
    socks5_handshake_and_connect(&mut current_stream, target_host, target_port).await?;
    Ok(current_stream)
}

async fn socks5_handshake_and_connect(
    stream: &mut TcpStream,
    host: &str,
    port: u16,
) -> Result<(), String> {
    // 1. Greet
    stream
        .write_all(&[0x05, 0x01, 0x00])
        .await
        .map_err(|e| format!("Socks handshake send error: {e}"))?;

    let mut auth_resp = [0u8; 2];
    stream
        .read_exact(&mut auth_resp)
        .await
        .map_err(|e| format!("Socks handshake read error: {e}"))?;

    if auth_resp[0] != 0x05 || auth_resp[1] != 0x00 {
        return Err(format!(
            "Socks authentication rejected or unexpected response: {:?}",
            auth_resp
        ));
    }

    // 2. Connect request (using domain name ATYP 0x03)
    let host_bytes = host.as_bytes();
    let host_len = host_bytes.len() as u8;
    let mut req = vec![0x05, 0x01, 0x00, 0x03, host_len];
    req.extend_from_slice(host_bytes);
    req.extend_from_slice(&port.to_be_bytes());

    stream
        .write_all(&req)
        .await
        .map_err(|e| format!("Socks CONNECT send error: {e}"))?;

    let mut resp_head = [0u8; 4];
    stream
        .read_exact(&mut resp_head)
        .await
        .map_err(|e| format!("Socks CONNECT read response error: {e}"))?;

    if resp_head[1] != 0x00 {
        return Err(format!(
            "Socks CONNECT failed with status code 0x{:02x}",
            resp_head[1]
        ));
    }

    // Read remaining bind address info based on ATYP
    match resp_head[3] {
        0x01 => {
            let mut buf = [0u8; 4 + 2];
            let _ = stream.read_exact(&mut buf).await;
        }
        0x03 => {
            let mut len = [0u8; 1];
            let _ = stream.read_exact(&mut len).await;
            let mut buf = vec![0u8; len[0] as usize + 2];
            let _ = stream.read_exact(&mut buf).await;
        }
        0x04 => {
            let mut buf = [0u8; 16 + 2];
            let _ = stream.read_exact(&mut buf).await;
        }
        _ => {}
    }

    Ok(())
}
