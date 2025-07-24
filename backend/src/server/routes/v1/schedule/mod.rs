use std::time::Instant;

use axum::{extract::Path, http::HeaderMap, response::IntoResponse};
use axum_extra::extract::Query;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tracing::{error, trace};

use crate::{
    database::Database,
    entity::util::versioned::Versioned,
    proto::gtfs_schedule::data::{Route, Shape, SimpleStop, Trip, shape::SimpleShape},
    server::request::JsonOrAccept,
};

pub async fn get_routes(headers: HeaderMap) -> impl IntoResponse {
    let routes = Database::query::<Route>("SELECT * FROM gtfs_routes", libsql::params![])
        .await
        .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, routes), headers).into_response()
}

pub async fn get_route(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let route = Database::query_one::<Route>(
        "SELECT * FROM gtfs_routes WHERE route_id = ?",
        libsql::params![id.clone()],
    )
    .await;

    match route {
        Ok(Some(route)) => JsonOrAccept(Versioned::new(1, route), headers).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Route not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get route");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get route").into_response()
        }
    }
}

pub async fn get_stops(headers: HeaderMap) -> impl IntoResponse {
    let stops = Database::query::<SimpleStop>("SELECT * FROM gtfs_stops", libsql::params![])
        .await
        .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, stops), headers).into_response()
}

pub async fn get_stop(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let stop = Database::query_one::<SimpleStop>(
        "SELECT * FROM gtfs_stops WHERE stop_id = ?",
        libsql::params![id.clone()],
    )
    .await;

    match stop {
        Ok(Some(stop)) => JsonOrAccept(Versioned::new(1, stop), headers).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Stop not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get stop");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get stop").into_response()
        }
    }
}

pub async fn get_simple_stops(headers: HeaderMap) -> impl IntoResponse {
    let stops = {
        let Ok(mut rows) = Database::conn()
            .lock()
            .await
            .query("SELECT * FROM gtfs_stops", libsql::params![])
            .await
        else {
            error!("Failed to get stops");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get stops").into_response();
        };
        let mut results = vec![];
        while let Ok(Some(row)) = rows.next().await {
            if let Ok(ss) = libsql::de::from_row::<SimpleStop>(&row) {
                results.push(ss.into_vec());
            }
        }
        results
    };

    JsonOrAccept(
        Versioned::new(
            1,
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
    let start = Instant::now();
    let stop_trips = {
        let trip_ids = Database::conn()
            .lock()
            .await
            .query(
                &format!(
                    "
                    SELECT
                        DISTINCT t.trip_id
                    FROM
                        gtfs_trips t
                        LEFT JOIN gtfs_stop_times st on st.trip_id = t.trip_id
                    WHERE
                        st.stop_id in ({})
                    ",
                    (0..query.stop.len())
                        .map(|_| "?")
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                query.stop.clone(),
            )
            .await;

        let mut trip_ids = match trip_ids {
            Ok(trip_ids) => trip_ids,
            Err(e) => {
                error!(%e, ?query.stop, "Failed to get stop ids");
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get stop ids")
                    .into_response();
            }
        };
        trace!(took = ?start.elapsed(), "Got stop trip response");

        let start = Instant::now();
        let mut res = vec![];
        while let Ok(Some(row)) = trip_ids.next().await {
            if let Ok(trip_id) = row.get::<String>(0) {
                res.push(trip_id);
            }
        }
        trace!(count = ?res.len(), took = ?start.elapsed(), "Read all stop trips");

        res
    };
    trace!(took = ?start.elapsed(), count = ?stop_trips.len(), "Got stop trips");

    JsonOrAccept(
        Versioned::new(
            1,
            serde_json::json!({
                "stopTrips": stop_trips,
            }),
        ),
        headers,
    )
    .into_response()
}

pub async fn get_trips(headers: HeaderMap) -> impl IntoResponse {
    let trips = Database::query::<Trip>("SELECT * FROM gtfs_trips", libsql::params![])
        .await
        .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, trips), headers).into_response()
}

pub async fn get_trip(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let trip = Database::query_one::<Trip>(
        "SELECT * FROM gtfs_trips WHERE trip_id = ?",
        libsql::params![id.clone()],
    )
    .await;

    match trip {
        Ok(Some(trip)) => JsonOrAccept(Versioned::new(1, trip), headers).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Trip not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get trip");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get trip").into_response()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripInfo {
    pub stop_ids: Vec<String>,
    pub route: Vec<(f32, f32)>,
}

pub async fn get_trip_info(headers: HeaderMap, Path(trip_id): Path<String>) -> impl IntoResponse {
    let trip = {
        let t = Database::query_one::<Trip>(
            "SELECT * FROM gtfs_trips WHERE trip_id = ?",
            libsql::params![trip_id.clone()],
        )
        .await;

        match t {
            Ok(Some(trip)) => trip,
            Ok(None) => return (StatusCode::NOT_FOUND, "Trip not found").into_response(),
            Err(e) => {
                error!(%e, ?trip_id, "Failed to get trip");
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get trip").into_response();
            }
        }
    };

    let shape_id = trip.shape_id.as_ref();

    let (shapes, stop_ids) = tokio::join!(
        async {
            if let Some(shape_id) = shape_id {
                Database::query::<Shape>(
                    "SELECT * FROM gtfs_shapes WHERE shape_id = ?",
                    libsql::params![shape_id.clone()],
                )
                .await
            } else {
                Ok(Vec::new())
            }
        },
        async {
            #[derive(Debug, Serialize, Deserialize)]
            struct StopId {
                #[serde(alias = "stop_id")]
                id: String,
                latitude: f32,
                longitude: f32,
            }

            Database::query::<StopId>(
                "
                SELECT DISTINCT
                    st.stop_id
                    , s.latitude
                    , s.longitude
                FROM gtfs_stop_times st
                LEFT JOIN gtfs_stops s on s.stop_id = st.stop_id
                WHERE
                    trip_id = ?
                GROUP BY st.stop_id
                ORDER BY st.stop_sequence
                ",
                libsql::params![trip_id.clone()],
            )
            .await
        },
    );

    let stop_ids = match stop_ids {
        Ok(stop_ids) => stop_ids,
        Err(e) => {
            error!(%e, ?trip_id, "Failed to get stop ids");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get stop ids").into_response();
        }
    };

    let route = {
        let shapes = match shapes {
            Ok(shapes) => shapes,
            Err(e) => {
                error!(%e, ?trip_id, "Failed to get shapes");
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get shapes").into_response();
            }
        };

        if shapes.is_empty() {
            stop_ids
                .iter()
                .map(|x| (x.longitude, x.latitude))
                .collect::<Vec<_>>()
        } else {
            shapes
                .iter()
                .map(|x| (x.longitude, x.latitude))
                .collect::<Vec<_>>()
        }
    };

    JsonOrAccept(
        Versioned::new(
            1,
            TripInfo {
                stop_ids: stop_ids.iter().map(|x| x.id.clone()).collect(),
                route,
            },
        ),
        headers,
    )
    .into_response()
}

pub async fn get_shapes(headers: HeaderMap) -> impl IntoResponse {
    let shapes = Database::query::<Shape>("SELECT * FROM gtfs_shapes", libsql::params![])
        .await
        .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, shapes), headers).into_response()
}

pub async fn get_shape(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let shape = Database::query_one::<Shape>(
        "SELECT * FROM gtfs_shapes WHERE shape_id = ?",
        libsql::params![id.clone()],
    )
    .await;

    match shape {
        Ok(Some(shape)) => JsonOrAccept(Versioned::new(1, shape), headers).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "Shape not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get shape");
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get shape").into_response()
        }
    }
}

pub async fn get_shape_for_trip(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let trip = Database::query_one::<Trip>(
        "SELECT * FROM gtfs_trips WHERE trip_id = ?",
        libsql::params![id.clone()],
    )
    .await;

    let trip = match trip {
        Ok(Some(trip)) => trip,
        Ok(None) => return (StatusCode::NOT_FOUND, "Trip not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get trip");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get trip").into_response();
        }
    };

    let Some(shape_id) = trip.shape_id.as_ref() else {
        return (StatusCode::NOT_FOUND, "Trip has no shape").into_response();
    };

    let shapes = Database::query::<SimpleShape>(
        "SELECT * FROM gtfs_shapes WHERE shape_id = ?",
        libsql::params![shape_id.clone()],
    )
    .await;

    let shapes = match shapes {
        Ok(shapes) => shapes,
        Err(e) => {
            error!(%e, ?shape_id, "Failed to get shape");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get shape").into_response();
        }
    };

    JsonOrAccept(
        Versioned::new(
            1,
            shapes.iter().map(SimpleShape::to_tuple).collect::<Vec<_>>(),
        ),
        headers,
    )
    .into_response()
}
