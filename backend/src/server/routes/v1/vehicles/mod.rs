use axum::{debug_handler, http::HeaderMap, response::IntoResponse};

use super::_entity::vehicle::Vehicle;
use crate::{proto::gtfs_realtime::fetcher::get_cached_feed, server::request::JsonOrAccept};

#[debug_handler]
pub async fn get_all(headers: HeaderMap) -> impl IntoResponse {
    let Some(feed) = get_cached_feed().await else {
        return JsonOrAccept::<Vec<Vehicle>>(vec![], headers).into_response();
    };

    let vehicles = feed
        .entity
        .iter()
        .filter_map(|x| x.vehicle.as_ref())
        .filter_map(|x| Vehicle::try_from(x).ok())
        .collect::<Vec<_>>();

    JsonOrAccept(vehicles, headers).into_response()
}
