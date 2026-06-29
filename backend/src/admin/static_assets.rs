use std::{ffi::OsStr, path::Path};

use axum::{
    Router,
    body::Body,
    http::{HeaderValue, Request, Response, StatusCode, header},
    middleware::{Next, from_fn},
    response::IntoResponse,
};
use include_dir::{Dir, include_dir};

static ADMIN_FRONTEND_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../frontend-admin/dist");

const CACHE_IMMUTABLE: HeaderValue =
    HeaderValue::from_static("public, max-age=31536000, immutable");
const CACHE_NO_CACHE: HeaderValue = HeaderValue::from_static("no-cache, max-age=0");
const CACHE_SHORT: HeaderValue = HeaderValue::from_static("public, max-age=3600, s-maxage=3600");

fn cache_control_for_path(path: &str) -> HeaderValue {
    let trimmed = path.trim_start_matches('/');
    let first_segment = trimmed.split('/').next().unwrap_or("");

    if first_segment.eq_ignore_ascii_case("_static") || first_segment.eq_ignore_ascii_case("assets")
    {
        return CACHE_IMMUTABLE;
    }

    let as_path = Path::new(path);
    if as_path.is_dir()
        || as_path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("html"))
    {
        return CACHE_NO_CACHE;
    }

    CACHE_SHORT
}

async fn set_admin_cache_control(request: Request<Body>, next: Next) -> Response<Body> {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    if response.status().is_success() && !response.headers().contains_key(header::CACHE_CONTROL) {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, cache_control_for_path(&path));
    }

    response
}

fn content_type_for(path: &str) -> HeaderValue {
    match Path::new(path).extension().and_then(OsStr::to_str) {
        Some("html") => HeaderValue::from_static("text/html; charset=utf-8"),
        Some("js" | "mjs") => HeaderValue::from_static("application/javascript; charset=utf-8"),
        Some("css") => HeaderValue::from_static("text/css; charset=utf-8"),
        Some("json" | "map") => HeaderValue::from_static("application/json; charset=utf-8"),
        Some("svg") => HeaderValue::from_static("image/svg+xml"),
        Some("png") => HeaderValue::from_static("image/png"),
        Some("ico") => HeaderValue::from_static("image/x-icon"),
        Some("woff2") => HeaderValue::from_static("font/woff2"),
        Some("woff") => HeaderValue::from_static("font/woff"),
        _ => HeaderValue::from_static("application/octet-stream"),
    }
}

fn serve_bytes(contents: &'static [u8], request_path: &str) -> Response<Body> {
    let mut response = Response::new(Body::from(contents));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type_for(request_path));
    response
}

async fn spa_or_asset(request: Request<Body>) -> Response<Body> {
    let raw = request.uri().path();
    let trimmed = raw.trim_start_matches('/');

    if !trimmed.is_empty()
        && let Some(file) = ADMIN_FRONTEND_DIR.get_file(trimmed)
    {
        return serve_bytes(file.contents(), raw);
    }

    ADMIN_FRONTEND_DIR.get_file("index.html").map_or_else(
        || StatusCode::NOT_FOUND.into_response(),
        |file| {
            let mut response = serve_bytes(file.contents(), "index.html");
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, CACHE_NO_CACHE);
            response
        },
    )
}

pub fn create_service<T>() -> Router<T>
where
    T: std::clone::Clone + Send + Sync + 'static,
{
    Router::new()
        .fallback(spa_or_asset)
        .layer(from_fn(set_admin_cache_control))
}
