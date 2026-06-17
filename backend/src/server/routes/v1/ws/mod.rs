use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, LazyLock},
    time::Duration,
};

use axum::{
    body::Bytes,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::IntoResponse,
};
use axum_client_ip::ClientIp;
use futures::{SinkExt, StreamExt};
use tokio::{
    sync::{Mutex, RwLock},
    time,
};
use tracing::{debug, error, trace, warn};

use super::{
    INITIAL_STATE, V1AppState,
    admin_notifications::{AdminNotification, NotificationTarget, get_admin_notification_receiver},
};
use crate::server::routes::v1::Transmission;

pub static WS_CONNECTIONS: LazyLock<Arc<RwLock<HashMap<IpAddr, u32>>>> =
    LazyLock::new(|| Arc::new(RwLock::new(HashMap::new())));

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<V1AppState>>,
    ClientIp(ip): ClientIp,
) -> impl IntoResponse {
    ws.on_upgrade(move |stream| websocket(stream, ip, state))
}

async fn handle_admin_notification(
    notification: &AdminNotification,
    addr: IpAddr,
    sender: &Arc<Mutex<futures::stream::SplitSink<WebSocket, Message>>>,
) -> bool {
    match notification {
        AdminNotification::Toast { bytes, target, ips } => {
            let should_send = match target {
                NotificationTarget::All => true,
                NotificationTarget::Ips => ips.contains(&addr),
            };

            if !should_send {
                return true;
            }

            if sender
                .lock()
                .await
                .send(Message::Binary(Bytes::from(bytes.clone())))
                .await
                .is_err()
            {
                return false;
            }
        }
    }
    true
}

async fn websocket(stream: WebSocket, addr: IpAddr, state: Arc<V1AppState>) {
    trace!(?stream, "Websocket opened");
    debug!(?addr, "Websocket opened");
    WS_CONNECTIONS
        .write()
        .await
        .entry(addr)
        .and_modify(|x| *x += 1)
        .or_insert(1);
    let (sender, _receiver) = stream.split();
    let sender = Arc::new(Mutex::new(sender));

    if let Err(e) = send_initial_state(sender.clone()).await {
        error!(?e, "Error sending initial state");
        cleanup_connection(addr).await;
        return;
    }

    let mut ping_interval = {
        #[allow(clippy::cast_sign_loss)]
        let interval = (30_000 + rand::random_range(-5_000_i64..5_000)) as u64;
        time::interval(Duration::from_millis(interval))
    };
    let mut transmission_rx = state.get_transmission_receiver();
    let mut notification_rx = get_admin_notification_receiver();

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                debug!(?addr, "Pinging client");
                if sender
                    .lock()
                    .await
                    .send(Message::Ping(Bytes::from_static(&[1, 2, 3])))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            result = state.wait_for_transmission(&mut transmission_rx) => {
                let transmission = match result {
                    Ok(t) => t,
                    Err(e) => {
                        warn!(?e, "Error waiting for transmission");
                        break;
                    }
                };

                if !handle_transmission(&transmission, addr, &sender).await {
                    break;
                }
            }
            result = notification_rx.recv() => {
                let notification = match result {
                    Ok(n) => n,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(count)) => {
                        warn!(count, "Admin notification channel lagged");
                        continue;
                    }
                    Err(e) => {
                        warn!(?e, "Admin notification channel closed");
                        break;
                    }
                };

                if !handle_admin_notification(&notification, addr, &sender).await {
                    break;
                }
            }
        }
    }

    cleanup_connection(addr).await;

    debug!(?addr, "Websocket closed");
}

/// Send a [`Transmission`] to a single client. Returns `false` if the
/// connection should be closed due to a send error.
async fn handle_transmission(
    transmission: &Transmission,
    addr: IpAddr,
    sender: &Arc<Mutex<futures::stream::SplitSink<WebSocket, Message>>>,
) -> bool {
    match transmission {
        Transmission::BroadcastToAll(data) => {
            trace!(to = ?addr, "Broadcasting data");
            sender
                .lock()
                .await
                .send(Message::Binary(Bytes::clone(data)))
                .await
                .is_ok()
        }
        Transmission::Empty => true,
    }
}

async fn cleanup_connection(addr: IpAddr) {
    let mut ws_connections = WS_CONNECTIONS.write().await;
    if let Some(count) = ws_connections.get_mut(&addr) {
        *count = count.saturating_sub(1);
        if *count == 0 {
            ws_connections.remove(&addr);
        }
    }
}

async fn send_initial_state(
    sender: Arc<Mutex<futures::stream::SplitSink<WebSocket, Message>>>,
) -> Result<(), axum::Error> {
    {
        let vehicles = INITIAL_STATE.read().await.vehicles.clone();

        let res = sender
            .lock()
            .await
            .send(Message::Binary(Bytes::from(vehicles)))
            .await;

        if let Err(e) = res {
            error!(?e, "Error sending initial vehicles");
            return Err(e);
        }
    }

    {
        let active_stops = INITIAL_STATE.read().await.active_stops.clone();

        let res = sender
            .lock()
            .await
            .send(Message::Binary(Bytes::from(active_stops)))
            .await;

        if let Err(e) = res {
            error!(?e, "Error sending initial active stops");
            return Err(e);
        }
    }

    {
        let notices = INITIAL_STATE.read().await.notices.clone();
        if !notices.is_empty() {
            let res = sender
                .lock()
                .await
                .send(Message::Binary(Bytes::from(notices)))
                .await;

            if let Err(e) = res {
                error!(?e, "Error sending initial notices");
                return Err(e);
            }
        }
    }

    {
        let gbfs_stations = INITIAL_STATE.read().await.gbfs_stations.clone();
        if !gbfs_stations.is_empty() {
            let res = sender
                .lock()
                .await
                .send(Message::Binary(Bytes::from(gbfs_stations)))
                .await;

            if let Err(e) = res {
                error!(?e, "Error sending initial GBFS stations");
                return Err(e);
            }
        }
    }

    Ok(())
}
