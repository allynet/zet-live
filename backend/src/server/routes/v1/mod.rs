use std::{collections::HashSet, sync::Arc, time::Instant};

use _entity::vehicle::Vehicle;
use axum::{Router, routing::get};
use once_cell::sync::Lazy;
use tokio::sync::{RwLock, watch};
use tracing::{error, trace};

use crate::{
    database::Database,
    entity::util::{mixed_value::MixedValue, versioned::Versioned},
    proto::gtfs_realtime::{
        data::transit_realtime::FeedMessage,
        fetcher::{get_cached_feed, wait_for_feed_update},
    },
};

mod _entity;
mod feed;
mod schedule;
mod vehicles;
mod ws;

pub fn create_v1_router() -> Router {
    let app_state = Arc::new(V1AppState::new());
    tokio::task::spawn(feed_listener(app_state.clone()));

    Router::new()
        .route("/vehicles", get(vehicles::get_all))
        .route("/feed", get(feed::get_feed))
        .route("/ws", get(ws::websocket_handler))
        .route("/ws/connections", get(ws::get_ws_connections))
        .route("/schedule/routes", get(schedule::get_routes))
        .route("/schedule/routes/{id}", get(schedule::get_route))
        .route("/schedule/stops", get(schedule::get_stops))
        .route("/schedule/stops/{id}", get(schedule::get_stop))
        .route("/schedule/simple-stops", get(schedule::get_simple_stops))
        .route("/schedule/stop-trips", get(schedule::get_stop_trips))
        .route("/schedule/trips", get(schedule::get_trips))
        .route("/schedule/trips/{id}", get(schedule::get_trip))
        .route("/schedule/shapes", get(schedule::get_shapes))
        .route("/schedule/shapes/{id}", get(schedule::get_shape))
        .route(
            "/schedule/shapes/for-trip/{id}",
            get(schedule::get_shape_for_trip),
        )
        .route(
            "/schedule/trip-info/{trip_id}",
            get(schedule::get_trip_info),
        )
        .with_state(app_state)
}

pub struct InitialState {
    vehicles: Vec<u8>,
    active_stops: Vec<u8>,
}
pub static INITIAL_STATE: Lazy<RwLock<InitialState>> = Lazy::new(|| {
    RwLock::new(InitialState {
        vehicles: Vec::new(),
        active_stops: Vec::new(),
    })
});

async fn feed_listener(app_state: Arc<V1AppState>) {
    if let Some(feed) = get_cached_feed().await {
        process_feed(app_state.clone(), feed);
    }
    loop {
        let feed = wait_for_feed_update().await;
        trace!(?feed.header, "Got feed update on v1 router");
        process_feed(app_state.clone(), feed);
    }
}

#[allow(clippy::too_many_lines)]
fn process_feed(app_state: Arc<V1AppState>, feed: Arc<FeedMessage>) {
    let active_stops_feed = feed.clone();
    let active_stops_app_state = app_state.clone();
    tokio::task::spawn(async move {
        let active_stops = {
            let start = Instant::now();
            let current_feed_trip_ids = active_stops_feed
                .entity
                .iter()
                .filter_map(|x| x.vehicle.as_ref())
                .filter_map(|x| x.trip.as_ref())
                .map(|x| x.trip_id().to_string())
                .collect::<HashSet<_>>();

            let (sel, params) = if current_feed_trip_ids.len() > 20_000 {
                (
                    "select value from json_each(?)".to_string(),
                    vec![
                        serde_json::to_string(&current_feed_trip_ids)
                            .expect("Failed to serialize trip ids"),
                    ],
                )
            } else {
                (
                    (0..current_feed_trip_ids.len())
                        .map(|_| "?")
                        .collect::<Vec<_>>()
                        .join(","),
                    current_feed_trip_ids.into_iter().collect::<Vec<_>>(),
                )
            };

            let active_stop_ids = Database::query_first_columns(
                &format!(
                    "
                        SELECT
                            DISTINCT stop_id
                        FROM
                            gtfs_stop_times
                        WHERE
                            trip_id in ({sel})
                        "
                ),
                params,
            )
            .await;
            let active_stop_ids = match active_stop_ids {
                Ok(rows) => rows,
                Err(e) => {
                    error!(?e, "Error getting active stops");
                    return;
                }
            };
            let active_stop_ids = active_stop_ids
                .into_iter()
                .filter_map(|x| x.as_text().cloned())
                .collect::<Vec<_>>();

            trace!(
                took = ?start.elapsed(),
                stops = ?active_stop_ids.len(),
                "Got active stops"
            );

            active_stop_ids
        };

        let active_stops = Versioned::new(1, Broadcast::ActiveStops(active_stops));
        let active_stops = minicbor_serde::to_vec(&active_stops);

        let active_stops = match active_stops {
            Ok(active_stops) => active_stops,
            Err(e) => {
                error!(?e, "Error serializing active stops");
                return;
            }
        };

        INITIAL_STATE
            .write()
            .await
            .active_stops
            .clone_from(&active_stops);

        active_stops_app_state.send_transmission(Transmission::BroadcastToAll(active_stops));
    });

    let vehicles_feed = feed;
    let vehicles_app_state = app_state;
    tokio::task::spawn(async move {
        let vehicles = tokio::task::spawn_blocking(move || {
            let simple_vehicles_feed = vehicles_feed
                .entity
                .iter()
                .filter_map(|x| x.vehicle.as_ref())
                .filter_map(|x| Vehicle::try_from(x).ok())
                .map(|x| x.to_simple())
                .collect::<Vec<_>>();

            let vehicles = Versioned::new(1, Broadcast::Vehicles(simple_vehicles_feed));

            minicbor_serde::to_vec(&vehicles)
        })
        .await;

        let vehicles = match vehicles {
            Ok(vehicles) => vehicles,
            Err(e) => {
                error!(?e, "Error joining thread");
                return;
            }
        };

        let vehicles = match vehicles {
            Ok(vehicles) => vehicles,
            Err(e) => {
                error!(?e, "Error serializing vehicles");
                return;
            }
        };

        INITIAL_STATE.write().await.vehicles.clone_from(&vehicles);

        vehicles_app_state.send_transmission(Transmission::BroadcastToAll(vehicles));
    });
}

pub struct V1AppState {
    tx: watch::Sender<Arc<Transmission>>,
    pub rx: watch::Receiver<Arc<Transmission>>,
}
impl V1AppState {
    pub fn new() -> Self {
        let (tx, rx) = watch::channel(Arc::new(Transmission::Empty));

        Self { tx, rx }
    }

    pub fn send_transmission(&self, transmission: Transmission) {
        let _ = self.tx.send(Arc::new(transmission));
    }

    pub fn get_transmission_receiver(&self) -> watch::Receiver<Arc<Transmission>> {
        self.rx.clone()
    }

    pub async fn wait_for_transmission(
        &self,
        rx: &mut watch::Receiver<Arc<Transmission>>,
    ) -> Result<Arc<Transmission>, watch::error::RecvError> {
        rx.changed().await?;

        Ok(rx.borrow_and_update().clone())
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Broadcast {
    Vehicles(Vec<Vec<MixedValue>>),
    ActiveStops(Vec<String>),
}

pub enum Transmission {
    Empty,
    BroadcastToAll(Vec<u8>),
}
