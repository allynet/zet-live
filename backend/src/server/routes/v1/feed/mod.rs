use axum::{http::HeaderMap, response::IntoResponse};

use crate::{proto::gtfs_realtime::fetcher::get_cached_feed, server::request::JsonOrAccept};

pub async fn get_feed(headers: HeaderMap) -> impl IntoResponse {
    let Some(feed) = get_cached_feed().await else {
        return JsonOrAccept::<[u8; 0]>([], headers).into_response();
    };

    JsonOrAccept(feed.as_ref(), headers).into_response()
}
