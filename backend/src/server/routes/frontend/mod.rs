use std::{ffi::OsStr, path::Path};

use axum::{
    Router,
    body::Body,
    http::{HeaderValue, Request, Response, header},
    middleware::{Next, from_fn},
};
use include_dir::{Dir, include_dir};
use tower_serve_static::ServeDir;

static FRONTEND_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../frontend/dist");

const CACHE_IMMUTABLE: HeaderValue =
    HeaderValue::from_static("public, max-age=31536000, immutable");
const CACHE_NO_CACHE: HeaderValue = HeaderValue::from_static("no-cache, max-age=0");
const CACHE_SHORT: HeaderValue = HeaderValue::from_static("public, max-age=3600, s-maxage=3600");

fn cache_control_for_path(path: &str) -> HeaderValue {
    let path = Path::new(path);

    let first_segment = path.iter().next().unwrap_or_else(|| OsStr::new("/"));

    if first_segment.eq_ignore_ascii_case("_static") || first_segment.eq_ignore_ascii_case("assets")
    {
        return CACHE_IMMUTABLE;
    }

    if path.is_dir()
        || path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("html"))
    {
        return CACHE_NO_CACHE;
    }

    CACHE_SHORT
}

async fn set_frontend_cache_control(request: Request<Body>, next: Next) -> Response<Body> {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;

    if response.status().is_success() {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, cache_control_for_path(&path));
    }

    response
}

pub fn create_service<T>() -> Router<T>
where
    T: std::clone::Clone + Send + Sync + 'static,
{
    Router::new()
        .fallback_service(ServeDir::new(&FRONTEND_DIR).append_index_html_on_directories(true))
        .layer(from_fn(set_frontend_cache_control))
}
