use axum::{Json, response::IntoResponse};

use crate::proto::gtfs_realtime::fetcher::get_cached_feed;

pub async fn get_feed() -> impl IntoResponse {
    let Some(feed) = get_cached_feed().await else {
        return Json::<[u8; 0]>([]).into_response();
    };

    Json(feed.as_ref()).into_response()
}
