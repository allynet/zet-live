use std::collections::{BTreeMap, HashMap, HashSet};

use axum::{extract::Path, http::HeaderMap, response::IntoResponse};
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use sqlx::{AssertSqlSafe, FromRow};
use tracing::{debug, error};

use crate::{
    database::Database,
    entity::util::versioned::Versioned,
    proto::gtfs_schedule::data::{Route, Shape, SimpleStop, Trip},
    server::{error::ApiError, request::JsonOrAccept},
};

async fn get_base_midnight() -> i64 {
    Database::logged(
        "get_base_midnight",
        sqlx::query_scalar!("SELECT base_midnight FROM live_feed_metadata WHERE id = 0")
            .fetch_optional(&Database::pool()),
    )
    .await
    .ok()
    .flatten()
    .unwrap_or_default()
}

pub async fn get_routes(headers: HeaderMap) -> impl IntoResponse {
    let routes = Database::logged(
        "get_routes",
        sqlx::query!(
            "
            SELECT *
            FROM gtfs_routes
            "
        )
        .fetch_all(&Database::pool()),
    )
    .await
    .map(|x| {
        x.into_iter()
            .map(|x| Route {
                id: x.route_id,
                agency_id: x.agency_id,
                short_name: x.route_short_name,
                long_name: x.route_long_name,
                desc: x.route_desc,
                url: x.route_url.and_then(|u| url::Url::parse(&u).ok()),
                color: x.route_color.unwrap_or_else(Route::default_route_color),
                text_color: x
                    .route_text_color
                    .unwrap_or_else(Route::default_route_text_color),
                route_type: x.route_type.and_then(|t| t.try_into().ok()),
                continuous_pickup: Default::default(),
                continuous_drop_off: Default::default(),
                network_id: None,
                sort_order: None,
            })
            .collect::<Vec<_>>()
    })
    .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, routes), headers).into_response()
}

pub async fn get_route(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let route = Database::logged(
        "get_route",
        sqlx::query!(
            "
                SELECT *
                FROM gtfs_routes
                WHERE route_id = ?
                ",
            id
        )
        .fetch_optional(&Database::pool()),
    )
    .await;

    match route {
        Ok(Some(route)) => {
            let route = Route {
                id: route.route_id,
                agency_id: route.agency_id,
                short_name: route.route_short_name,
                long_name: route.route_long_name,
                desc: route.route_desc,
                url: route.route_url.and_then(|u| url::Url::parse(&u).ok()),
                color: route.route_color.unwrap_or_else(Route::default_route_color),
                text_color: route
                    .route_text_color
                    .unwrap_or_else(Route::default_route_text_color),
                route_type: route.route_type.and_then(|t| t.try_into().ok()),
                continuous_pickup: Default::default(),
                continuous_drop_off: Default::default(),
                network_id: None,
                sort_order: None,
            };

            JsonOrAccept(Versioned::new(1, route), headers).into_response()
        }
        Ok(None) => ApiError::not_found("Route not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get route");
            ApiError::internal("Failed to get route").into_response()
        }
    }
}

pub async fn get_stops(headers: HeaderMap) -> impl IntoResponse {
    let stops = Database::logged(
        "get_stops",
        sqlx::query!(
            "
            SELECT
                  stop_id
                , stop_name
                , latitude
                , longitude
            FROM gtfs_stops
            "
        )
        .fetch_all(&Database::pool()),
    )
    .await
    .map(|x| {
        x.into_iter()
            .map(|x| SimpleStop {
                id: x.stop_id,
                name: x.stop_name.unwrap_or_default(),
                latitude: x.latitude.unwrap_or_default(),
                longitude: x.longitude.unwrap_or_default(),
            })
            .collect::<Vec<_>>()
    })
    .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, stops), headers).into_response()
}

pub async fn get_stop(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let stop = Database::logged(
        "get_stop",
        sqlx::query!(
            "
            SELECT
                  stop_id
                , stop_name
                , latitude
                , longitude
            FROM gtfs_stops
            WHERE stop_id = ?
            ",
            id
        )
        .fetch_optional(&Database::pool()),
    )
    .await;

    match stop {
        Ok(Some(stop)) => {
            let stop = SimpleStop {
                id: stop.stop_id,
                name: stop.stop_name.unwrap_or_default(),
                latitude: stop.latitude.unwrap_or_default(),
                longitude: stop.longitude.unwrap_or_default(),
            };

            JsonOrAccept(Versioned::new(1, stop), headers).into_response()
        }
        Ok(None) => ApiError::not_found("Stop not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get stop");
            ApiError::internal("Failed to get stop").into_response()
        }
    }
}

pub async fn get_simple_stops(headers: HeaderMap) -> impl IntoResponse {
    JsonOrAccept(
        Versioned::new(
            1,
            serde_json::json!({
                "simpleStops": *crate::server::routes::v1::SIMPLE_STOPS.read().await,
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
#[allow(clippy::too_many_lines)]
pub async fn get_stop_trips(
    headers: HeaderMap,
    Query(query): Query<GetStopTripsQuery>,
) -> impl IntoResponse {
    if query.stop.is_empty() {
        return JsonOrAccept(
            Versioned::new(
                1,
                serde_json::json!({
                    "stopTrips": Vec::<String>::new(),
                    "arrivalTimes": Vec::<StopArrivalTime>::new(),
                }),
            ),
            headers,
        )
        .into_response();
    }

    let global_base_midnight = get_base_midnight().await;

    let sql = format!(
        "
        SELECT
              lv.vehicle_id
            , lv.trip_id
            , lv.route_id
            , gst.stop_id
            , gst.stop_sequence
            , lv.next_stop_sequence
            , lst.arrival_time  AS live_arrival_time
            , lst.arrival_delay AS live_arrival_delay
            , gst.arrival_time_seconds
            , (
                SELECT
                    lst2.arrival_delay
                FROM live_trip_stop_times lst2
                WHERE   lst2.trip_id = lv.trip_id
                    AND lst2.stop_sequence <= gst.stop_sequence
                    AND lst2.arrival_delay IS NOT NULL
                ORDER BY lst2.stop_sequence DESC LIMIT 1
            ) AS effective_delay
        FROM live_vehicles lv
        JOIN gtfs_stop_times gst ON gst.trip_id = lv.trip_id
        LEFT JOIN live_trip_stop_times lst
            ON  lst.trip_id = lv.trip_id
            AND lst.stop_sequence = gst.stop_sequence
        WHERE gst.stop_id IN ({})
        ORDER BY gst.stop_sequence
        ",
        query
            .stop
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", "),
    );

    let mut q = {
        #[derive(Debug, FromRow)]
        struct StopTripRow {
            vehicle_id: String,
            trip_id: String,
            route_id: String,
            stop_id: String,
            stop_sequence: u32,
            next_stop_sequence: Option<u32>,
            live_arrival_time: Option<i64>,
            live_arrival_delay: Option<i32>,
            arrival_time_seconds: Option<i64>,
            effective_delay: Option<i32>,
        }

        sqlx::query_as::<_, StopTripRow>(AssertSqlSafe(sql))
    };
    for stop in &query.stop {
        q = q.bind(stop.clone());
    }
    let rows = match Database::logged("get_stop_trips", q.fetch_all(&Database::pool())).await {
        Ok(rows) => rows,
        Err(e) => {
            error!(%e, "Failed to get stop trips");
            return ApiError::internal("Failed to get stop trips").into_response();
        }
    };

    let mut seen_vehicles = HashSet::new();
    let mut seen_trips = HashSet::new();
    let mut arrival_times = Vec::new();

    let now = jiff::Timestamp::now().as_second();

    let mut trip_base_midnight = HashMap::new();

    for row in &rows {
        if let (Some(live_time), Some(offset)) = (row.live_arrival_time, row.arrival_time_seconds) {
            let delay = i64::from(row.live_arrival_delay.unwrap_or(0));
            let computed = live_time - delay - offset;
            if computed.abs_diff(now) < 86400 * 2 {
                trip_base_midnight
                    .entry(row.trip_id.clone())
                    .or_insert(computed);
            }
        }
    }

    for row in &rows {
        seen_trips.insert(row.trip_id.clone());

        if !seen_vehicles.insert(row.vehicle_id.clone()) {
            continue;
        }

        if let Some(next_seq) = row.next_stop_sequence
            && row.stop_sequence < next_seq
        {
            continue;
        }

        let base_midnight = trip_base_midnight
            .get(&row.trip_id)
            .copied()
            .unwrap_or(global_base_midnight);

        let has_live_prediction =
            row.live_arrival_time.is_some() || row.live_arrival_delay.is_some();

        let predicted = if has_live_prediction {
            if row.live_arrival_time.is_some() {
                row.live_arrival_time
            } else if let (Some(delay), Some(offset)) =
                (row.live_arrival_delay, row.arrival_time_seconds)
            {
                Some(base_midnight + offset + i64::from(delay))
            } else {
                None
            }
        } else if let (Some(offset), Some(delay)) = (row.arrival_time_seconds, row.effective_delay)
        {
            Some(base_midnight + offset + i64::from(delay))
        } else {
            None
        };

        arrival_times.push(StopArrivalTime {
            trip_id: row.trip_id.clone(),
            vehicle_id: row.vehicle_id.clone(),
            route_id: row.route_id.clone(),
            stop_id: row.stop_id.clone(),
            arrival_time: predicted,
        });
    }

    let stop_trips = seen_trips.into_iter().collect::<Vec<_>>();

    arrival_times.sort_by(|a, b| match (a.arrival_time, b.arrival_time) {
        (Some(a), Some(b)) => a.cmp(&b),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    });

    JsonOrAccept(
        Versioned::new(
            1,
            serde_json::json!({
                "stopTrips": stop_trips,
                "arrivalTimes": arrival_times,
            }),
        ),
        headers,
    )
    .into_response()
}

pub async fn get_trips(headers: HeaderMap) -> impl IntoResponse {
    let trips = Database::logged(
        "get_trips",
        sqlx::query!(
            "
            SELECT
                trip_id
                , route_id
                , service_id
                , trip_headsign
                , trip_short_name
                , direction_id
                , block_id
                , shape_id
                , wheelchair_boarding
                , bikes_allowed
            FROM gtfs_trips
            "
        )
        .fetch_all(&Database::pool()),
    )
    .await
    .map(|rows| {
        rows.into_iter()
            .filter_map(|row| {
                Some(Trip {
                    id: row.trip_id,
                    route_id: row.route_id?,
                    service_id: row.service_id?,
                    headsign: row.trip_headsign,
                    short_name: row.trip_short_name,
                    direction_id: row.direction_id.and_then(|d| d.try_into().ok()),
                    block_id: row.block_id,
                    shape_id: row.shape_id,
                    wheelchair_boarding: row
                        .wheelchair_boarding
                        .and_then(|d| d.try_into().ok())
                        .unwrap_or_default(),
                    bikes_allowed: row
                        .bikes_allowed
                        .and_then(|d| d.try_into().ok())
                        .unwrap_or_default(),
                    stop_ids: vec![],
                })
            })
            .collect::<Vec<_>>()
    })
    .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, trips), headers).into_response()
}

pub async fn get_trip(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let trip = Database::logged(
        "get_trip",
        sqlx::query!(
            "
            SELECT
                trip_id
                , route_id
                , service_id
                , trip_headsign
                , trip_short_name
                , direction_id
                , block_id
                , shape_id
                , wheelchair_boarding
                , bikes_allowed
            FROM gtfs_trips
            WHERE trip_id = ?
            ",
            id
        )
        .fetch_optional(&Database::pool()),
    )
    .await;

    let trip = match trip {
        Ok(trip) => trip,
        Err(e) => {
            error!(%e, ?id, "Failed to get trip");
            return ApiError::internal("Failed to get trip").into_response();
        }
    };

    let trip = trip.and_then(|trip| {
        Some(Trip {
            id: trip.trip_id,
            route_id: trip.route_id?,
            service_id: trip.service_id?,
            headsign: trip.trip_headsign,
            short_name: trip.trip_short_name,
            direction_id: trip.direction_id.and_then(|d| d.try_into().ok()),
            block_id: trip.block_id,
            shape_id: trip.shape_id,
            wheelchair_boarding: trip
                .wheelchair_boarding
                .and_then(|d| d.try_into().ok())
                .unwrap_or_default(),
            bikes_allowed: trip
                .bikes_allowed
                .and_then(|d| d.try_into().ok())
                .unwrap_or_default(),
            stop_ids: vec![],
        })
    });

    JsonOrAccept(Versioned::new(1, trip), headers).into_response()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripStopTime {
    pub stop_id: String,
    pub stop_sequence: u64,
    pub stop_name: String,
    pub arrival_time: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripInfo {
    pub stop_ids: Vec<String>,
    pub route: Vec<(f64, f64)>,
    pub stop_times: Vec<TripStopTime>,
}

#[allow(clippy::too_many_lines)]
pub async fn get_trip_info(headers: HeaderMap, Path(trip_id): Path<String>) -> impl IntoResponse {
    let trip = {
        let trip_id = trip_id.clone();
        let t = Database::logged(
            "get_trip_info_shape_id",
            sqlx::query!("SELECT shape_id FROM gtfs_trips WHERE trip_id = ?", trip_id)
                .fetch_optional(&Database::pool()),
        )
        .await;

        match t {
            Ok(Some(trip)) => trip,
            Ok(None) => return ApiError::not_found("Trip not found").into_response(),
            Err(e) => {
                error!(%e, ?trip_id, "Failed to get trip");
                return ApiError::internal("Failed to get trip").into_response();
            }
        }
    };

    let shape_id = trip.shape_id.as_ref();

    let pool = Database::pool();

    let (shapes, stop_ids, scheduled, live) = tokio::join!(
        async {
            if let Some(shape_id) = shape_id {
                let shape_id = shape_id.clone();
                Database::logged(
                    "get_trip_info_shapes",
                    sqlx::query!(
                        "SELECT * FROM gtfs_shapes WHERE shape_id = ? order by shape_pt_sequence",
                        shape_id
                    )
                    .fetch_all(&pool),
                )
                .await
            } else {
                Ok(Vec::new())
            }
        },
        async {
            let trip_id = trip_id.clone();
            Database::logged(
                "get_trip_info_stop_ids",
                sqlx::query!(
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
                    trip_id
                )
                .fetch_all(&pool),
            )
            .await
        },
        {
            let trip_id = trip_id.clone();
            let pool = pool.clone();

            async move {
                Database::logged(
                    "get_trip_info_scheduled",
                    sqlx::query!(
                        r"SELECT
                    st.stop_id,
                    st.stop_sequence,
                    st.arrival_time,
                    st.arrival_time_seconds,
                    s.stop_name
                FROM gtfs_stop_times st
                LEFT JOIN gtfs_stops s ON s.stop_id = st.stop_id
                WHERE st.trip_id = ?
                ORDER BY st.stop_sequence",
                        trip_id
                    )
                    .fetch_all(&pool),
                )
                .await
            }
        },
        {
            let trip_id = trip_id.clone();
            let pool = pool.clone();

            async move {
                Database::logged(
                    "get_trip_info_live",
                    sqlx::query!(
                        "SELECT
                          stop_sequence
                        , arrival_time
                        , arrival_delay
                    FROM live_trip_stop_times
                    WHERE trip_id = ?",
                        trip_id
                    )
                    .fetch_all(&pool),
                )
                .await
            }
        },
    );

    let stop_ids = match stop_ids {
        Ok(stop_ids) => stop_ids,
        Err(e) => {
            error!(%e, ?trip_id, "Failed to get stop ids");
            return ApiError::internal("Failed to get stop ids").into_response();
        }
    };

    let route = {
        let shapes = match shapes {
            Ok(shapes) => shapes,
            Err(e) => {
                error!(%e, ?trip_id, "Failed to get shapes");
                return ApiError::internal("Failed to get shapes").into_response();
            }
        };

        if shapes.is_empty() {
            stop_ids
                .iter()
                .filter_map(|x| {
                    Some(
                        Coord {
                            latitude: x.latitude?,
                            longitude: x.longitude?,
                        }
                        .as_tuple(),
                    )
                })
                .collect::<Vec<_>>()
        } else {
            shapes
                .iter()
                .map(|x| {
                    Coord {
                        latitude: x.shape_pt_lat,
                        longitude: x.shape_pt_lon,
                    }
                    .as_tuple()
                })
                .collect::<Vec<_>>()
        }
    };

    let stop_times = {
        let scheduled = match scheduled {
            Ok(s) => s,
            Err(e) => {
                error!(%e, ?trip_id, "Failed to get scheduled stop times");
                Vec::new()
            }
        };
        let live = match live {
            Ok(l) => l,
            Err(e) => {
                error!(%e, ?trip_id, "Failed to get live stop times");
                Vec::new()
            }
        };

        let base_midnight = {
            let global = get_base_midnight().await;
            let now = jiff::Timestamp::now().as_second();

            live.iter()
                .find_map(|l| {
                    let time = l.arrival_time?;
                    let offset = scheduled
                        .iter()
                        .find(|s| s.stop_sequence == l.stop_sequence)
                        .and_then(|s| s.arrival_time_seconds)?;
                    let delay = l.arrival_delay.unwrap_or(0);
                    let computed = time - delay - offset;
                    (computed.abs_diff(now) < 86400 * 2).then_some(computed)
                })
                .unwrap_or(global)
        };

        let live_by_seq = live
            .iter()
            .map(|l| (l.stop_sequence, l))
            .collect::<HashMap<_, _>>();

        let mut delay_map = BTreeMap::new();
        for l in &live {
            if let Some(delay) = l.arrival_delay {
                delay_map.insert(l.stop_sequence, delay);
            } else if let (Some(time), Some(offset)) = (l.arrival_time, {
                scheduled
                    .iter()
                    .find(|s| s.stop_sequence == l.stop_sequence)
                    .and_then(|s| s.arrival_time_seconds)
            }) {
                let sched_unix = base_midnight + offset;
                let computed_delay = time - sched_unix;
                delay_map.insert(l.stop_sequence, computed_delay);
            }
        }

        let mut stop_times = scheduled
            .into_iter()
            .map(|s| {
                let live_stu = live_by_seq.get(&s.stop_sequence);

                let has_live_prediction =
                    live_stu.is_some_and(|l| l.arrival_time.is_some() || l.arrival_delay.is_some());

                let propagated_delay = delay_map
                    .range(..=s.stop_sequence)
                    .next_back()
                    .map(|(_, &d)| d);

                let predicted_arrival = if has_live_prediction && let Some(live_stu) = live_stu {
                    if live_stu.arrival_time.is_some() {
                        live_stu.arrival_time
                    } else if let (Some(delay), Some(offset)) =
                        (live_stu.arrival_delay, s.arrival_time_seconds)
                    {
                        Some(base_midnight + offset + delay)
                    } else {
                        None
                    }
                } else if let (Some(offset), Some(delay)) =
                    (s.arrival_time_seconds, propagated_delay)
                {
                    Some(base_midnight + offset + delay)
                } else {
                    None
                };

                TripStopTime {
                    stop_id: s.stop_id.clone(),
                    #[allow(clippy::cast_sign_loss)]
                    stop_sequence: s.stop_sequence as u64,
                    stop_name: s.stop_name.unwrap_or_default(),
                    arrival_time: predicted_arrival,
                }
            })
            .collect::<Vec<_>>();

        let mut max_time = None;
        for st in &mut stop_times {
            let Some(t) = st.arrival_time else { continue };

            if let Some(max) = max_time
                && t < max
            {
                debug!(
                    stop_id = %st.stop_id,
                    stop_sequence = st.stop_sequence,
                    predicted = t,
                    previous_max = max,
                    ?trip_id,
                    "Non-monotonic arrival time detected, clamping to previous"
                );
                st.arrival_time = Some(max);
            }

            max_time = Some(t.max(max_time.unwrap_or(i64::MIN)));
        }

        // Null out predicted arrivals for stops the vehicle has already
        // passed (arrival more than 30s in the past). A 30s buffer
        // accounts for clock drift between feed updates, data fetching,
        // and processing latency.
        let now = jiff::Timestamp::now().as_second();
        for st in &mut stop_times {
            if let Some(t) = st.arrival_time
                && t < now - 30
            {
                st.arrival_time = None;
            }
        }

        stop_times
    };

    JsonOrAccept(
        Versioned::new(
            1,
            TripInfo {
                stop_ids: stop_ids.iter().map(|x| x.stop_id.clone()).collect(),
                route,
                stop_times,
            },
        ),
        headers,
    )
    .into_response()
}

struct Coord {
    latitude: f64,
    longitude: f64,
}
impl Coord {
    pub const fn as_tuple(&self) -> (f64, f64) {
        (self.longitude, self.latitude)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopArrivalTime {
    trip_id: String,
    vehicle_id: String,
    route_id: String,
    stop_id: String,
    arrival_time: Option<i64>,
}

pub async fn get_shapes(headers: HeaderMap) -> impl IntoResponse {
    let shapes = Database::logged(
        "get_shapes",
        sqlx::query_as!(
            Shape,
            r#"SELECT
                shape_id as "id",
                shape_pt_lat as "latitude",
                shape_pt_lon as "longitude",
                shape_pt_sequence as "sequence: u32",
                shape_dist_traveled as "distance"
            FROM gtfs_shapes"#
        )
        .fetch_all(&Database::pool()),
    )
    .await
    .unwrap_or_default();

    JsonOrAccept(Versioned::new(1, shapes), headers).into_response()
}

pub async fn get_shape(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let shape = Database::logged(
        "get_shape",
        sqlx::query_as!(
            Shape,
            r#"SELECT
                shape_id as "id",
                shape_pt_lat as "latitude",
                shape_pt_lon as "longitude",
                shape_pt_sequence as "sequence: u32",
                shape_dist_traveled as "distance"
            FROM gtfs_shapes WHERE shape_id = ?"#,
            id
        )
        .fetch_optional(&Database::pool()),
    )
    .await;

    match shape {
        Ok(Some(shape)) => JsonOrAccept(Versioned::new(1, shape), headers).into_response(),
        Ok(None) => ApiError::not_found("Shape not found").into_response(),
        Err(e) => {
            error!(%e, "Failed to get shape");
            ApiError::internal("Failed to get shape").into_response()
        }
    }
}

pub async fn get_shape_for_trip(headers: HeaderMap, Path(id): Path<String>) -> impl IntoResponse {
    let trip = Database::logged(
        "get_shape_for_trip_trip",
        sqlx::query!("SELECT shape_id FROM gtfs_trips WHERE trip_id = ?", id)
            .fetch_optional(&Database::pool()),
    )
    .await;

    let trip = match trip {
        Ok(Some(trip)) => trip,
        Ok(None) => return ApiError::not_found("Trip not found").into_response(),
        Err(e) => {
            error!(%e, ?id, "Failed to get trip");
            return ApiError::internal("Failed to get trip").into_response();
        }
    };

    let Some(shape_id) = trip.shape_id else {
        return ApiError::not_found("Trip has no shape").into_response();
    };

    let shapes = Database::logged(
        "get_shape_for_trip_points",
        sqlx::query!(
            "
            SELECT
                shape_pt_lat
                , shape_pt_lon
            FROM gtfs_shapes
            WHERE shape_id = ?
            ",
            shape_id
        )
        .fetch_all(&Database::pool()),
    )
    .await;

    let shapes = match shapes {
        Ok(shapes) => shapes,
        Err(e) => {
            error!(%e, "Failed to get shape");
            return ApiError::internal("Failed to get shape").into_response();
        }
    };

    JsonOrAccept(
        Versioned::new(
            1,
            shapes
                .iter()
                .map(|x| (x.shape_pt_lon, x.shape_pt_lat))
                .collect::<Vec<_>>(),
        ),
        headers,
    )
    .into_response()
}
