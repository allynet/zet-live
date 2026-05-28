use axum::{debug_handler, http::HeaderMap, response::IntoResponse};

use super::_entity::vehicle::Vehicle;
use crate::{database::Database, server::request::JsonOrAccept};

#[derive(Debug, serde::Deserialize)]
#[allow(clippy::struct_field_names)]
struct VehicleRow {
    vehicle_id: String,
    route_id: String,
    trip_id: String,
    route_long_name: Option<String>,
    latitude: f32,
    longitude: f32,
    prev_latitude: Option<f32>,
    prev_longitude: Option<f32>,
    bearing: Option<f32>,
    next_stop_id: Option<String>,
    next_stop_sequence: Option<u32>,
    next_stop_arrival_delay: Option<i32>,
    next_stop_arrival_time: Option<i64>,
}

impl From<VehicleRow> for Vehicle {
    fn from(row: VehicleRow) -> Self {
        Self {
            id: row.vehicle_id,
            route_id: row.route_id,
            trip_id: row.trip_id,
            route_long_name: row.route_long_name,
            latitude: row.latitude,
            longitude: row.longitude,
            bearing: row.bearing,
            prev_latitude: row.prev_latitude,
            prev_longitude: row.prev_longitude,
            next_stop_id: row.next_stop_id,
            next_stop_sequence: row.next_stop_sequence,
            next_stop_arrival_delay: row.next_stop_arrival_delay,
            next_stop_arrival_time: row.next_stop_arrival_time,
        }
    }
}

#[debug_handler]
pub async fn get_all(headers: HeaderMap) -> impl IntoResponse {
    let vehicles = Database::query::<VehicleRow>(
        "SELECT vehicle_id, route_id, trip_id, route_long_name, latitude, longitude, \
         prev_latitude, prev_longitude, bearing, next_stop_id, next_stop_sequence, \
         next_stop_arrival_delay, next_stop_arrival_time FROM live_vehicles",
        libsql::params![],
    )
    .await
    .unwrap_or_default()
    .into_iter()
    .map(Vehicle::from)
    .collect::<Vec<_>>();

    JsonOrAccept(vehicles, headers).into_response()
}
