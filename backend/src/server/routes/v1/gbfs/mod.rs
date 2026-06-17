use axum::{http::HeaderMap, response::IntoResponse};
use tracing::error;

use crate::server::request::JsonOrAccept;

/// `GET /api/v1/gbfs/stations` — all stations joined with realtime status.
pub async fn get_stations(headers: HeaderMap) -> impl IntoResponse {
    match super::fetch_gbfs_stations().await {
        Ok(stations) => JsonOrAccept(stations, headers).into_response(),
        Err(e) => {
            error!(?e, "Failed to fetch GBFS stations for REST endpoint");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to fetch GBFS stations",
            )
                .into_response()
        }
    }
}
