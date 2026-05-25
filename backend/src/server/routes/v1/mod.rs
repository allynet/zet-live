use std::{
    collections::{HashMap, HashSet},
    fmt::Write,
    sync::Arc,
    time::Instant,
};

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

            trace!(current_feed_trips = ?current_feed_trip_ids.len(), "Updating active trips");
            let stmts_start = Instant::now();
            let stmts = {
                let mut stmts = String::new();

                stmts.push_str("delete from live_trips;\n");
                for trip_id in &current_feed_trip_ids {
                    let res = writeln!(
                        stmts,
                        "insert into live_trips (trip_id) values ('{}');",
                        trip_id.replace('\'', "''")
                    );

                    if let Err(e) = res {
                        error!(?e, "Failed to write to stmts");
                        return;
                    }
                }

                stmts
            };

            trace!(took = ?stmts_start.elapsed(), "Built batch statements for active trips");

            if let Err(e) = Database::conn()
                .lock()
                .await
                .execute_transactional_batch(&stmts)
                .await
            {
                error!(?e, "Failed to execute batch statements for active trips");
                return;
            }

            trace!(took = ?stmts_start.elapsed(), "Updated active trips");

            let active_stop_ids = Database::query_first_columns(
                "
                SELECT
                    DISTINCT stop_id
                FROM live_trips lt
                LEFT JOIN gtfs_stop_times gst
                    ON lt.trip_id = gst.trip_id
                ",
                libsql::params![],
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
        struct NextStopInfo {
            stop_id: String,
            stop_sequence: u32,
            arrival_delay: Option<i32>,
            arrival_time: Option<i64>,
        }

        struct LiveStopTimeInfo {
            stop_id: String,
            stop_sequence: u32,
            arrival_time: Option<i64>,
            arrival_delay: Option<i32>,
        }

        let (trip_updates, all_stop_times): (
            HashMap<String, NextStopInfo>,
            HashMap<String, Vec<LiveStopTimeInfo>>,
        ) = vehicles_feed
            .entity
            .iter()
            .filter_map(|x| x.trip_update.as_ref())
            .filter_map(|tu| {
                let trip_id = tu.trip.trip_id().to_string();
                if trip_id.is_empty() {
                    return None;
                }

                // The GTFS-RT feed's first StopTimeUpdate may be for a stop
                // the vehicle has already passed (feed lag). Skip any stops
                // whose predicted arrival is more than 30s in the past so the
                // frontend always highlights a genuinely upcoming stop.
                let now_secs = jiff::Timestamp::now().as_second();
                let first_stu = tu
                    .stop_time_update
                    .iter()
                    .find(|stu| {
                        stu.arrival
                            .as_ref()
                            .and_then(|a| a.time)
                            .is_none_or(|time| time >= now_secs - 30)
                    })
                    .or_else(|| tu.stop_time_update.last())?;
                let first_stop_sequence = first_stu.stop_sequence?;

                let next_stop = NextStopInfo {
                    stop_id: first_stu.stop_id().to_string(),
                    stop_sequence: first_stop_sequence,
                    arrival_delay: first_stu.arrival.as_ref().and_then(|a| a.delay),
                    arrival_time: first_stu.arrival.as_ref().and_then(|a| a.time),
                };

                let all_stus = tu
                    .stop_time_update
                    .iter()
                    .filter_map(|stu| {
                        let stop_sequence = stu.stop_sequence?;
                        Some(LiveStopTimeInfo {
                            stop_id: stu.stop_id().to_string(),
                            stop_sequence,
                            arrival_time: stu.arrival.as_ref().and_then(|a| a.time),
                            arrival_delay: stu.arrival.as_ref().and_then(|a| a.delay),
                        })
                    })
                    .collect::<Vec<_>>();

                Some(((trip_id.clone(), next_stop), (trip_id, all_stus)))
            })
            .unzip();

        let vehicles = vehicles_feed
            .entity
            .iter()
            .filter_map(|x| x.vehicle.as_ref())
            .filter_map(|x| Vehicle::try_from(x).ok())
            .map(|mut v| {
                if let Some(next) = trip_updates.get(&v.trip_id) {
                    v.next_stop_id = Some(next.stop_id.clone());
                    v.next_stop_sequence = Some(next.stop_sequence);
                    v.next_stop_arrival_delay = next.arrival_delay;
                    v.next_stop_arrival_time = next.arrival_time;
                }
                v
            })
            .collect::<Vec<_>>();

        trace!(current_vehicles = ?vehicles.len(), "Updating vehicles");

        let previous_positions: HashMap<String, (f32, f32, Option<f32>)> = {
            #[derive(serde::Deserialize)]
            struct PrevPosition {
                vehicle_id: String,
                latitude: f32,
                longitude: f32,
                bearing: Option<f32>,
            }

            let rows = Database::query::<PrevPosition>(
                "SELECT vehicle_id, latitude, longitude, bearing FROM live_vehicles",
                libsql::params![],
            )
            .await;

            match rows {
                Ok(rows) => rows
                    .into_iter()
                    .map(|r| (r.vehicle_id, (r.latitude, r.longitude, r.bearing)))
                    .collect(),
                Err(e) => {
                    error!(?e, "Error fetching previous positions");
                    HashMap::new()
                }
            }
        };

        let vehicles: Vec<Vehicle> = vehicles
            .into_iter()
            .map(|mut v| {
                if let Some((prev_lat, prev_lng, prev_bearing)) = previous_positions.get(&v.id) {
                    let dist = haversine_distance(*prev_lat, *prev_lng, v.latitude, v.longitude);
                    if dist < 5.0 {
                        v.latitude = *prev_lat;
                        v.longitude = *prev_lng;
                        v.bearing = *prev_bearing;
                    } else {
                        v.prev_latitude = Some(*prev_lat);
                        v.prev_longitude = Some(*prev_lng);
                        v.bearing = Some(
                            (v.longitude - *prev_lng)
                                .atan2(v.latitude - *prev_lat)
                                .to_degrees(),
                        );
                    }
                }
                v
            })
            .collect();

        let stmts_start = Instant::now();
        let stmts = {
            let mut stmts = String::new();

            stmts.push_str("delete from live_vehicles;\n");
            stmts.push_str("delete from live_trip_stop_times;\n");

            let schedule_offsets = {
                let trip_ids = all_stop_times.keys().cloned().collect::<Vec<_>>();
                if trip_ids.is_empty() {
                    HashMap::new()
                } else {
                    let placeholders = trip_ids.iter().map(|_| "?").collect::<Vec<_>>();
                    let sql = format!(
                        "SELECT trip_id, stop_sequence, arrival_time_seconds FROM gtfs_stop_times \
                         WHERE trip_id IN ({}) AND arrival_time_seconds IS NOT NULL",
                        placeholders.join(", ")
                    );
                    let mut map = HashMap::new();
                    let param_refs = trip_ids.iter().map(String::as_str).collect::<Vec<_>>();
                    if let Ok(mut rows) = Database::conn()
                        .lock()
                        .await
                        .query(&sql, libsql::params_from_iter(param_refs))
                        .await
                    {
                        while let Ok(Some(row)) = rows.next().await {
                            let Ok(trip_id) = row.get::<String>(0) else {
                                continue;
                            };
                            let Ok(stop_sequence) = row.get::<u32>(1) else {
                                continue;
                            };
                            let Ok(offset) = row.get::<i64>(2) else {
                                continue;
                            };
                            map.insert((trip_id, stop_sequence), offset);
                        }
                    }
                    map
                }
            };

            let base_midnight_sql =
                compute_base_midnight_sql(all_stop_times.iter().flat_map(|(trip_id, stops)| {
                    stops.iter().map(|s| {
                        let offset = schedule_offsets
                            .get(&(trip_id.clone(), s.stop_sequence))
                            .copied();
                        (s.arrival_time, s.arrival_delay, offset)
                    })
                }));

            for vehicle in &vehicles {
                let prev_lat_sql = vehicle
                    .prev_latitude
                    .map_or_else(|| "NULL".to_string(), |v| v.to_string());
                let prev_lng_sql = vehicle
                    .prev_longitude
                    .map_or_else(|| "NULL".to_string(), |v| v.to_string());
                let bearing_sql = vehicle
                    .bearing
                    .map_or_else(|| "NULL".to_string(), |v| v.to_string());
                let next_stop_id_sql = vehicle.next_stop_id.as_deref().map_or_else(
                    || "NULL".to_string(),
                    |v| format!("'{}'", v.replace('\'', "''")),
                );
                let next_stop_seq_sql = vehicle
                    .next_stop_sequence
                    .map_or_else(|| "NULL".to_string(), |v| v.to_string());
                let next_stop_delay_sql = vehicle
                    .next_stop_arrival_delay
                    .map_or_else(|| "NULL".to_string(), |v| v.to_string());
                let next_stop_arrival_time_sql = vehicle
                    .next_stop_arrival_time
                    .map_or_else(|| "NULL".to_string(), |v| v.to_string());

                let res = writeln!(
                    stmts,
                    "INSERT INTO live_vehicles
                    ( vehicle_id
                    , route_id
                    , trip_id
                    , latitude
                    , longitude
                    , prev_latitude
                    , prev_longitude
                    , bearing
                    , next_stop_id
                    , next_stop_sequence
                    , next_stop_arrival_delay
                    , next_stop_arrival_time
                    ) values
                    ( '{}'
                    , '{}'
                    , '{}'
                    , {}
                    , {}
                    , {}
                    , {}
                    , {}
                    , {}
                    , {}
                    , {}
                    , {}
                    );",
                    vehicle.id.replace('\'', "''"),
                    vehicle.route_id.replace('\'', "''"),
                    vehicle.trip_id.replace('\'', "''"),
                    vehicle.latitude,
                    vehicle.longitude,
                    prev_lat_sql,
                    prev_lng_sql,
                    bearing_sql,
                    next_stop_id_sql,
                    next_stop_seq_sql,
                    next_stop_delay_sql,
                    next_stop_arrival_time_sql,
                );

                if let Err(e) = res {
                    error!(?e, "Failed to write to stmts");
                    return;
                }
            }

            for (trip_id, stop_times) in &all_stop_times {
                for stu in stop_times {
                    let arrival_time_sql = stu
                        .arrival_time
                        .map_or_else(|| "NULL".to_string(), |v| v.to_string());
                    let arrival_delay_sql = stu
                        .arrival_delay
                        .map_or_else(|| "NULL".to_string(), |v| v.to_string());

                    let res = writeln!(
                        stmts,
                        "INSERT INTO live_trip_stop_times
                        ( trip_id
                        , stop_id
                        , stop_sequence
                        , arrival_time
                        , arrival_delay
                        ) values
                        ( '{}'
                        , '{}'
                        , {}
                        , {}
                        , {}
                        );",
                        trip_id.replace('\'', "''"),
                        stu.stop_id.replace('\'', "''"),
                        stu.stop_sequence,
                        arrival_time_sql,
                        arrival_delay_sql,
                    );

                    if let Err(e) = res {
                        error!(?e, "Failed to write to stmts");
                        return;
                    }
                }
            }

            stmts.push_str(&base_midnight_sql);

            stmts
        };

        trace!(took = ?stmts_start.elapsed(), "Built batch statements for vehicles");

        if let Err(e) = Database::conn()
            .lock()
            .await
            .execute_transactional_batch(&stmts)
            .await
        {
            error!(?e, "Failed to execute batch statements for vehicles");
            return;
        }

        trace!(took = ?stmts_start.elapsed(), "Updated vehicles");

        let vehicles = tokio::task::spawn_blocking(move || {
            let simple_vehicles_feed = vehicles
                .iter()
                .map(_entity::vehicle::Vehicle::to_simple)
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

fn haversine_distance(lat1: f32, lng1: f32, lat2: f32, lng2: f32) -> f32 {
    let lat1_rad = lat1.to_radians();
    let lat2_rad = lat2.to_radians();
    let dlat = (lat2 - lat1).to_radians();
    let dlng = (lng2 - lng1).to_radians();

    let a = (lat1_rad.cos() * lat2_rad.cos())
        .mul_add((dlng / 2.0).sin().powi(2), (dlat / 2.0).sin().powi(2));
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    6_371_000.0 * c
}

fn compute_base_midnight_sql(
    stop_times: impl Iterator<Item = (Option<i64>, Option<i32>, Option<i64>)>,
) -> String {
    let now = jiff::Timestamp::now().as_second();

    let best_base = stop_times
        .filter_map(|(arrival_time, arrival_delay, arrival_time_seconds)| {
            Some((
                arrival_time?,
                i64::from(arrival_delay.unwrap_or(0)),
                arrival_time_seconds?,
            ))
        })
        .map(|(live_time, delay, offset)| {
            let base = live_time - delay - offset;

            (base, base.abs_diff(now))
        })
        .reduce(|(best_base, best_diff), (base, diff)| {
            if diff < best_diff && diff < 86400 * 2 {
                (base, diff)
            } else {
                (best_base, best_diff)
            }
        })
        .map_or(0, |(base, _)| base);

    format!("UPDATE live_feed_metadata SET base_midnight = {best_base} WHERE id = 0;\n")
}
