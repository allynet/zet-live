use axum::{Json, debug_handler};

use crate::proto::gtfs_realtime::fetcher::get_cached_feed;

use super::_entity::vehicle::Vehicle;

#[debug_handler]
pub async fn get_all() -> Json<Vec<Vehicle>> {
    let Some(feed) = get_cached_feed().await else {
        return Json(vec![]);
    };

    let vehicles = feed
        .entity
        .iter()
        .filter_map(|x| x.vehicle.as_ref())
        .filter_map(|x| Vehicle::try_from(x).ok())
        .collect::<Vec<_>>();

    Json(vehicles)
}
