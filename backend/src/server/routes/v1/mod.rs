use std::sync::Arc;

use _entity::vehicle::Vehicle;
use axum::{Router, routing::get};
use tokio::sync::watch;
use tracing::{error, trace};

use crate::{
    entity::util::{mixed_value::MixedValue, versioned::Versioned},
    proto::gtfs_realtime::fetcher::wait_for_feed_update,
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

async fn feed_listener(app_state: Arc<V1AppState>) {
    loop {
        let feed = wait_for_feed_update().await;
        trace!(?feed.header, "Got feed update on v1 router");

        let vehicles_feed = feed.clone();
        let vehicles = tokio::task::spawn_blocking(move || {
            let vehicles_feed = vehicles_feed
                .entity
                .iter()
                .filter_map(|x| x.vehicle.as_ref())
                .filter_map(|x| Vehicle::try_from(x).ok())
                .map(|x| x.to_simple())
                .collect::<Vec<_>>();

            let vehicles = Versioned::new_now(1, Broadcast::Vehicles(vehicles_feed));
            minicbor_serde::to_vec(&vehicles)
        })
        .await;

        let vehicles = match vehicles {
            Ok(vehicles) => vehicles,
            Err(e) => {
                error!(?e, "Error joining thread");
                continue;
            }
        };

        let vehicles = match vehicles {
            Ok(vehicles) => vehicles,
            Err(e) => {
                error!(?e, "Error serializing vehicles");
                continue;
            }
        };

        app_state.send_transmission(Transmission::BroadcastToAll(vehicles));
    }
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
}

pub enum Transmission {
    Empty,
    BroadcastToAll(Vec<u8>),
}
