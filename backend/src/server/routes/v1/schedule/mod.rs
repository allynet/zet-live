use std::collections::{BTreeMap, HashMap, HashSet};

use axum::{extract::Path, http::HeaderMap, response::IntoResponse};
use axum_extra::extract::Query;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use tracing::{debug, error};

use crate::{
    database::Database,
    entity::util::versioned::Versioned,
    proto::gtfs_schedule::data::{Route, Shape, SimpleStop, Trip, shape::SimpleShape},
    server::request::JsonOrAccept,
};

async fn get_base_midnight() -> i64 {
    Database::query_one::<BaseMidnightRow>(
        "SELECT base_midnight FROM live_feed_metadata WHERE id = 0",
        libsql::params![],
    )
    .await
    .ok()
    .flatten()
    .map_or(0, |r| r.base_midnight)
}

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
        let Ok(results) = Database::query::<SimpleStop>(
            "
                SELECT DISTINCT
                    s.stop_id, s.stop_name, s.longitude, s.latitude
                FROM live_trips lt
                LEFT JOIN gtfs_stop_times st on st.trip_id = lt.trip_id
                LEFT JOIN gtfs_stops s on s.stop_id = st.stop_id
                ",
            libsql::params![],
        )
        .await
        else {
            error!("Failed to get stops");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to get stops").into_response();
        };

        results
            .into_iter()
            .map(crate::proto::gtfs_schedule::data::stop::SimpleStop::into_vec)
            .collect::<Vec<_>>()
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

    let stop_placeholders: Vec<&str> = query.stop.iter().map(|_| "?").collect();
    let stop_list = stop_placeholders.join(", ");

    let global_base_midnight = get_base_midnight().await;

    let rows = match Database::query::<StopTripRow>(
        &format!(
            "SELECT
            lv.vehicle_id,
            lv.trip_id,
            lv.route_id,
            gst.stop_id,
            gst.stop_sequence,
            lv.next_stop_sequence,
            lst.arrival_time     AS live_arrival_time,
            lst.arrival_delay    AS live_arrival_delay,
            gst.arrival_time_seconds,
            (SELECT lst2.arrival_delay FROM live_trip_stop_times lst2
             WHERE lst2.trip_id = lv.trip_id
               AND lst2.stop_sequence <= gst.stop_sequence
               AND lst2.arrival_delay IS NOT NULL
             ORDER BY lst2.stop_sequence DESC LIMIT 1
            ) AS effective_delay
         FROM live_vehicles lv
         JOIN gtfs_stop_times gst ON gst.trip_id = lv.trip_id
         LEFT JOIN live_trip_stop_times lst
                ON lst.trip_id = lv.trip_id
               AND lst.stop_sequence = gst.stop_sequence
         WHERE gst.stop_id IN ({stop_list})
         ORDER BY gst.stop_sequence"
        ),
        libsql::params_from_iter(query.stop.clone()),
    )
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            error!(%e, "Failed to get stop trips");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to get stop trips",
            )
                .into_response();
        }
    };

    let mut seen_vehicles: HashSet<String> = HashSet::new();
    let mut seen_trips: HashSet<String> = HashSet::new();
    let mut arrival_times: Vec<StopArrivalTime> = Vec::new();

    let now = jiff::Timestamp::now().as_second();

    let mut trip_base_midnight: HashMap<String, i64> = HashMap::new();

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

    let stop_trips: Vec<String> = seen_trips.into_iter().collect();

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripStopTime {
    pub stop_id: String,
    pub stop_sequence: u32,
    pub stop_name: String,
    pub arrival_time: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TripInfo {
    pub stop_ids: Vec<String>,
    pub route: Vec<(f32, f32)>,
    pub stop_times: Vec<TripStopTime>,
}

#[allow(clippy::too_many_lines)]
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

    let (shapes, stop_ids, scheduled, live) = tokio::join!(
        async {
            if let Some(shape_id) = shape_id {
                Database::query::<Shape>(
                    "SELECT * FROM gtfs_shapes WHERE shape_id = ? order by shape_pt_sequence",
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
        Database::query::<ScheduledStopTimeWithNames>(
            "SELECT st.stop_id, st.stop_sequence, st.arrival_time, st.arrival_time_seconds, \
             s.stop_name FROM gtfs_stop_times st LEFT JOIN gtfs_stops s ON s.stop_id = st.stop_id \
             WHERE st.trip_id = ? ORDER BY st.stop_sequence",
            libsql::params![trip_id.clone()],
        ),
        Database::query::<LiveStopTime>(
            "SELECT stop_sequence, arrival_time, arrival_delay FROM live_trip_stop_times WHERE \
             trip_id = ?",
            libsql::params![trip_id.clone()],
        ),
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
                    let delay = i64::from(l.arrival_delay.unwrap_or(0));
                    let computed = time - delay - offset;
                    (computed.abs_diff(now) < 86400 * 2).then_some(computed)
                })
                .unwrap_or(global)
        };

        let live_by_seq: HashMap<u32, &LiveStopTime> =
            live.iter().map(|l| (l.stop_sequence, l)).collect();

        let mut delay_map: BTreeMap<u32, i32> = BTreeMap::new();
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
                #[allow(clippy::cast_possible_truncation)]
                let computed_delay = (time - sched_unix) as i32;
                delay_map.insert(l.stop_sequence, computed_delay);
            }
        }

        let mut stop_times: Vec<TripStopTime> = scheduled
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
                        Some(base_midnight + offset + i64::from(delay))
                    } else {
                        None
                    }
                } else if let (Some(offset), Some(delay)) =
                    (s.arrival_time_seconds, propagated_delay)
                {
                    Some(base_midnight + offset + i64::from(delay))
                } else {
                    None
                };

                TripStopTime {
                    stop_id: s.stop_id.clone(),
                    stop_sequence: s.stop_sequence,
                    stop_name: s.stop_name.unwrap_or_default(),
                    arrival_time: predicted_arrival,
                }
            })
            .collect();

        let mut max_time: Option<i64> = None;
        for st in &mut stop_times {
            if let Some(t) = st.arrival_time {
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
                stop_ids: stop_ids.iter().map(|x| x.id.clone()).collect(),
                route,
                stop_times,
            },
        ),
        headers,
    )
    .into_response()
}

#[derive(Debug, Deserialize)]
struct ScheduledStopTimeWithNames {
    stop_id: String,
    stop_sequence: u32,
    #[allow(dead_code)]
    arrival_time: Option<String>,
    arrival_time_seconds: Option<i64>,
    stop_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LiveStopTime {
    stop_sequence: u32,
    arrival_time: Option<i64>,
    arrival_delay: Option<i32>,
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

#[derive(Debug, Deserialize)]
struct BaseMidnightRow {
    base_midnight: i64,
}

#[derive(Debug, Deserialize)]
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
