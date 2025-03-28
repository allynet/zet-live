use axum::{Router, http::HeaderValue, response::Response};
use include_dir::{Dir, include_dir};
use reqwest::header;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_serve_static::ServeDir;

static FRONTEND_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../frontend/dist");

pub fn create_service<T>() -> Router<T>
where
    T: std::clone::Clone + Send + Sync + 'static,
{
    Router::new()
        .fallback_service(ServeDir::new(&FRONTEND_DIR).append_index_html_on_directories(true))
        .layer(SetResponseHeaderLayer::appending(
            header::CACHE_CONTROL,
            |_response: &Response<_>| {
                Some(
                    HeaderValue::from_str("public, max-age=3600, s-maxage=3600")
                        .expect("Invalid header value"),
                )
            },
        ))
}
