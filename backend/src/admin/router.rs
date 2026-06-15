use std::collections::HashMap;

use axum::{
    Router,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use tracing::{debug, warn};

use crate::{
    admin,
    server::routes::v1::{
        admin_notifications::{ToastPayload, send_notification},
        ws::WS_CONNECTIONS,
    },
};

#[derive(Clone)]
pub struct AdminState {
    pub admin_key: String,
}

pub fn create_admin_router(state: AdminState) -> Router {
    let api = Router::new()
        .route("/connections", get(get_connections))
        .route("/settings", get(get_settings))
        .route("/settings/{name}", get(get_setting).put(put_setting))
        .route("/sync/realtime", post(force_sync_realtime))
        .route("/sync/static", post(force_sync_static))
        .route("/metadata", get(get_metadata))
        .route("/notify", post(send_notify))
        .layer(axum::middleware::from_fn_with_state(
            state.admin_key.clone(),
            auth_middleware,
        ))
        .with_state(state);

    Router::new()
        .nest("/api", api)
        .route("/", get(admin_html))
        .route("/index.html", get(admin_html))
}

async fn admin_html() -> impl IntoResponse {
    Html(include_str!("html/index.html"))
}

async fn auth_middleware(
    axum::extract::State(admin_key): axum::extract::State<String>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let auth = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth {
        Some(header) if header == format!("Bearer {admin_key}") => next.run(request).await,
        _ => {
            warn!("Unauthorized admin API request");
            StatusCode::UNAUTHORIZED.into_response()
        }
    }
}

async fn get_connections(headers: HeaderMap) -> impl IntoResponse {
    let connections = WS_CONNECTIONS.read().await.clone();
    crate::server::request::JsonOrAccept(connections, headers).into_response()
}

async fn get_settings() -> impl IntoResponse {
    let settings = admin::ADMIN_SETTINGS.read().await.clone();
    axum::Json(settings).into_response()
}

async fn get_setting(Path(name): Path<String>) -> impl IntoResponse {
    let value = serde_json::to_value(admin::ADMIN_SETTINGS.read().await.clone())
        .expect("Failed to serialize admin settings")
        .as_object()
        .expect("Admin settings must be an object")
        .get(name.as_str())
        .cloned();

    value.map_or_else(
        || StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        |v| axum::Json(serde_json::json!({ "name": name, "value": v })).into_response(),
    )
}

#[derive(Deserialize)]
struct UpdateSettingRequest {
    value: serde_json::Value,
}

async fn put_setting(
    Path(name): Path<String>,
    axum::Json(body): axum::Json<UpdateSettingRequest>,
) -> impl IntoResponse {
    match admin::update_setting(&name, body.value).await {
        Ok(settings) => axum::Json(settings).into_response(),
        Err(e) => {
            warn!(error = %e, "Failed to update setting");
            StatusCode::BAD_REQUEST.into_response()
        }
    }
}

async fn force_sync_realtime() -> impl IntoResponse {
    debug!("Force realtime sync triggered via admin API");
    crate::proto::gtfs_realtime::fetcher::force_sync();
    StatusCode::ACCEPTED.into_response()
}

async fn force_sync_static() -> impl IntoResponse {
    debug!("Force static sync triggered via admin API");
    crate::proto::gtfs_schedule::fetcher::force_sync();
    StatusCode::ACCEPTED.into_response()
}

async fn get_metadata() -> impl IntoResponse {
    let entries = admin::metadata::read_all_metadata().await;
    let map = entries.into_iter().collect::<HashMap<_, _>>();
    axum::Json(map).into_response()
}

async fn send_notify(axum::Json(payload): axum::Json<ToastPayload>) -> impl IntoResponse {
    debug!(?payload, "Sending admin notification");
    send_notification(payload).await;
    StatusCode::ACCEPTED.into_response()
}
