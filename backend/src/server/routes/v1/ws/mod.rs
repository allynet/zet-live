use std::{collections::HashMap, net::IpAddr, sync::Arc, time::Duration};

use axum::{
    body::Bytes,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::HeaderMap,
    response::IntoResponse,
};
use axum_client_ip::{InsecureClientIp, SecureClientIp};
use futures::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use tokio::{
    sync::{Mutex, RwLock},
    time,
};
use tracing::{debug, error, trace, warn};

use super::{INITIAL_STATE, V1AppState};
use crate::server::{request::JsonOrAccept, routes::v1::Transmission};

pub static WS_CONNECTIONS: Lazy<Arc<RwLock<HashMap<IpAddr, u32>>>> =
    Lazy::new(|| Arc::new(RwLock::new(HashMap::new())));

pub async fn get_ws_connections(headers: HeaderMap) -> impl IntoResponse {
    JsonOrAccept(WS_CONNECTIONS.read().await.clone(), headers).into_response()
}

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<V1AppState>>,
    InsecureClientIp(insecure_ip): InsecureClientIp,
    SecureClientIp(secure_ip): SecureClientIp,
) -> impl IntoResponse {
    if insecure_ip != secure_ip {
        warn!(
            ?insecure_ip,
            ?secure_ip,
            "Insecure and secure IPs do not match"
        );
    }
    ws.on_upgrade(move |stream| websocket(stream, insecure_ip, state))
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
        return;
    }

    // ping the client every 30ish seconds
    let mut ping_handle = {
        let mut ping_interval = {
            // randomize ping interval as 30 seconds +/- 5 seconds
            #[allow(clippy::cast_sign_loss)] // Will always be positive
            let interval = (30_000 + rand::random_range(-5_000..5_000)) as u64;
            time::interval(Duration::from_millis(interval))
        };
        let sender = sender.clone();
        tokio::spawn(async move {
            loop {
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
                ping_interval.tick().await;
            }
        })
    };

    let mut transmission_handle = {
        tokio::spawn(async move {
            let mut rx = state.get_transmission_receiver();
            loop {
                let transmission = match state.wait_for_transmission(&mut rx).await {
                    Ok(transmission) => transmission,
                    Err(e) => {
                        warn!(?e, "Error waiting for transmission");
                        break;
                    }
                };

                match transmission.as_ref() {
                    Transmission::BroadcastToAll(data) => {
                        trace!(to = ?addr, "Broadcasting vehicles");
                        let res = sender
                            .lock()
                            .await
                            .send(Message::Binary(Bytes::copy_from_slice(data)))
                            .await;

                        if let Err(err) = res {
                            trace!(to = ?addr, ?err, "Closing websocket due to send error");
                            break;
                        }
                    }
                    Transmission::Empty => {}
                }
            }
        })
    };

    tokio::select! {
        _ = &mut ping_handle => transmission_handle.abort(),
        _ = &mut transmission_handle => ping_handle.abort(),
    }

    {
        let mut ws_connections = WS_CONNECTIONS.write().await;
        let ws_connection = ws_connections.get_mut(&addr);
        let mut count = 0;
        if let Some(x) = ws_connection {
            if *x > 0 {
                *x -= 1;
                count = *x;
            }
        }
        drop(ws_connections);
        if count == 0 {
            WS_CONNECTIONS.write().await.remove(&addr);
        }
    }
    debug!(?addr, "Websocket closed");
}

async fn send_initial_state(
    sender: Arc<Mutex<futures::stream::SplitSink<WebSocket, Message>>>,
) -> Result<(), axum::Error> {
    let initial_state = INITIAL_STATE.read().await;
    let vehicles = async {
        let vehicles = initial_state.vehicles.clone();

        sender
            .lock()
            .await
            .send(Message::Binary(Bytes::from(vehicles)))
            .await
    };
    let active_stops = async {
        let active_stops = initial_state.active_stops.clone();

        sender
            .lock()
            .await
            .send(Message::Binary(Bytes::from(active_stops)))
            .await
    };

    let (vehicles, active_stops) = tokio::join!(vehicles, active_stops);

    if let Err(e) = vehicles {
        error!(?e, "Error sending initial vehicles");
        return Err(e);
    }

    if let Err(e) = active_stops {
        error!(?e, "Error sending initial active stops");
        return Err(e);
    }

    Ok(())
}
