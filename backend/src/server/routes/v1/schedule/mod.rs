use axum::{extract::Path, http::HeaderMap, response::IntoResponse};
use axum_extra::extract::Query;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::{
    entity::util::versioned::Versioned,
    proto::gtfs_schedule::{
        data::{SimpleStop, shape::SimpleShape},
        fetcher::get_cached_schedule,
    },
    server::request::JsonOrAccept,
};

pub async fn get_routes(headers: HeaderMap) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();
    let routes = schedule
        .as_ref()
        .map(|x| x.routes.clone())
        .unwrap_or_default();

    let data = Versioned::new_with_timestamp(1, ts, routes);

    JsonOrAccept(data, headers).into_response()
}

pub async fn get_route(headers: HeaderMap, Path(id): Path<u32>) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();

    schedule
        .as_ref()
        .and_then(|x| x.routes.get(&id))
        .map_or_else(
            || (StatusCode::NOT_FOUND, "Route not found").into_response(),
            |route| {
                JsonOrAccept(Versioned::new_with_timestamp(1, ts, route), headers).into_response()
            },
        )
}

pub async fn get_stops(headers: HeaderMap) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();
    let stops = schedule
        .as_ref()
        .map(|x| x.stops.clone())
        .unwrap_or_default();

    JsonOrAccept(Versioned::new_with_timestamp(1, ts, stops), headers).into_response()
}

pub async fn get_stop(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();

    schedule
        .as_ref()
        .and_then(|x| x.stops.get(&id))
        .map_or_else(
            || (StatusCode::NOT_FOUND, "Stop not found").into_response(),
            |stop| {
                JsonOrAccept(Versioned::new_with_timestamp(1, ts, stop), headers).into_response()
            },
        )
}

pub async fn get_simple_stops(headers: HeaderMap) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();
    let stops = schedule
        .as_ref()
        .map(|x| {
            x.stops
                .values()
                .map(|x| SimpleStop::from(x.clone()).into_vec())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    JsonOrAccept(
        Versioned::new_with_timestamp(
            1,
            ts,
            serde_json::json!({
                "simpleStops": stops,
            }),
        ),
        headers,
    )
    .into_response()
}

#[derive(Deserialize)]
pub struct GetStopTripsQuery {
    #[serde(default)]
    pub stop: Vec<String>,
}
pub async fn get_stop_trips(
    headers: HeaderMap,
    Query(query): Query<GetStopTripsQuery>,
) -> impl IntoResponse {
    let Some(schedule) = get_cached_schedule().await else {
        return (StatusCode::NOT_FOUND, "Schedule not found").into_response();
    };
    let ts = schedule.get_ts();

    let stop_trips = schedule
        .stops
        .values()
        .filter(|x| query.stop.contains(&x.id))
        .flat_map(|x| x.trip_ids_stop_here.clone())
        .collect::<Vec<_>>();

    JsonOrAccept(
        Versioned::new_with_timestamp(
            1,
            ts,
            serde_json::json!({
                "stopTrips": stop_trips,
            }),
        ),
        headers,
    )
    .into_response()
}

pub async fn get_trips(headers: HeaderMap) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();
    let trips = schedule.map(|x| x.trips.clone()).unwrap_or_default();

    JsonOrAccept(Versioned::new_with_timestamp(1, ts, trips), headers).into_response()
}

pub async fn get_trip(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();

    schedule
        .as_ref()
        .and_then(|x| x.trips.get(&id))
        .map_or_else(
            || (StatusCode::NOT_FOUND, "Trip not found").into_response(),
            |trip| {
                JsonOrAccept(Versioned::new_with_timestamp(1, ts, trip), headers).into_response()
            },
        )
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripInfo {
    pub stop_ids: Vec<String>,
    pub route: Vec<(f32, f32)>,
}

pub async fn get_trip_info(headers: HeaderMap, Path(trip_id): Path<String>) -> impl IntoResponse {
    let Some(schedule) = get_cached_schedule().await else {
        return (StatusCode::NOT_FOUND, "Schedule not found").into_response();
    };
    let ts = schedule.get_ts();

    let Some(trip) = schedule.trips.get(&trip_id) else {
        return (StatusCode::NOT_FOUND, "Trip not found").into_response();
    };

    let Some(shape_id) = trip.shape_id.as_ref() else {
        return (StatusCode::NOT_FOUND, "Trip has no shape").into_response();
    };

    let Some(shape) = schedule.shapes.get(shape_id) else {
        return (StatusCode::NOT_FOUND, "Shape not found").into_response();
    };
    let route = shape.iter().map(SimpleShape::to_tuple).collect::<Vec<_>>();

    JsonOrAccept(
        Versioned::new_with_timestamp(
            1,
            ts,
            TripInfo {
                stop_ids: trip.stop_ids.clone(),
                route,
            },
        ),
        headers,
    )
    .into_response()
}

pub async fn get_shapes(headers: HeaderMap) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();
    let shapes = schedule
        .as_ref()
        .map(|x| x.shapes.clone())
        .unwrap_or_default();

    JsonOrAccept(Versioned::new_with_timestamp(1, ts, shapes), headers).into_response()
}

pub async fn get_shape(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let schedule = get_cached_schedule().await;
    let ts = schedule.as_ref().map(|x| x.get_ts()).unwrap_or_default();

    schedule
        .as_ref()
        .and_then(|x| x.shapes.get(&id))
        .map(|x| x.iter().map(SimpleShape::to_tuple).collect::<Vec<_>>())
        .map_or_else(
            || (StatusCode::NOT_FOUND, "Shape not found").into_response(),
            |shape| {
                JsonOrAccept(Versioned::new_with_timestamp(1, ts, shape), headers).into_response()
            },
        )
}

pub async fn get_shape_for_trip(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let Some(schedule) = get_cached_schedule().await else {
        return (StatusCode::NOT_FOUND, "Schedule not found").into_response();
    };
    let ts = schedule.get_ts();

    let Some(trip) = schedule.trips.get(&id) else {
        return (StatusCode::NOT_FOUND, "Trip not found").into_response();
    };

    let Some(shape_id) = trip.shape_id.as_ref() else {
        return (StatusCode::NOT_FOUND, "Trip has no shape").into_response();
    };

    let Some(shape) = schedule.shapes.get(shape_id) else {
        return (StatusCode::NOT_FOUND, "Shape not found").into_response();
    };

    JsonOrAccept(
        Versioned::new_with_timestamp(
            1,
            ts,
            shape.iter().map(SimpleShape::to_tuple).collect::<Vec<_>>(),
        ),
        headers,
    )
    .into_response()
}
