use std::time::Duration;

use axum::{
    Router,
    http::{HeaderValue, Request, Response},
};
use axum_client_ip::SecureClientIpSource;
use reqwest::header;
use tower::ServiceBuilder;
use tower_http::{
    catch_panic::CatchPanicLayer,
    cors::{self, CorsLayer},
    request_id::{MakeRequestId, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing::{Span, debug, field, info};

mod frontend;
mod v1;

#[derive(Clone)]
struct MakeRequestUlid;
impl MakeRequestId for MakeRequestUlid {
    fn make_request_id<B>(&mut self, _request: &Request<B>) -> Option<RequestId> {
        let mut id = ulid::Ulid::new().to_string();
        id.make_ascii_lowercase();
        let val = HeaderValue::from_str(&id).ok()?;

        Some(RequestId::new(val))
    }
}

pub fn create_router() -> Router {
    add_middlewares(
        Router::new()
            .fallback_service(frontend::create_service())
            .nest("/api/v1", v1::create_v1_router()),
    )
}

fn add_middlewares<T>(router: Router<T>) -> Router<T>
where
    T: std::clone::Clone + Send + Sync + 'static,
{
    router
        .layer(CatchPanicLayer::new())
        .layer(
            ServiceBuilder::new()
                .layer(SecureClientIpSource::ConnectInfo.into_extension())
                .layer(SetRequestIdLayer::x_request_id(MakeRequestUlid))
                .layer(
                    TraceLayer::new_for_http()
                        .make_span_with(|request: &Request<_>| {
                            let m = request.method();
                            let p = request.uri().path();
                            let id = request
                                .extensions()
                                .get::<RequestId>()
                                .and_then(|id| id.header_value().to_str().ok())
                                .unwrap_or("-");
                            let dur = field::Empty;
                            let user = field::Empty;

                            tracing::info_span!("", %id, %m, ?p, dur, user)
                        })
                        .on_request(|request: &Request<_>, _span: &Span| {
                            let headers = request.headers();
                            info!(
                                target: "request",
                                "START \"{method} {uri} {http_type:?}\" {user_agent:?} {ip:?}",
                                http_type = request.version(),
                                method = request.method(),
                                uri = request.uri(),
                                user_agent = headers
                                    .get(header::USER_AGENT)
                                    .map_or("-", |x| x.to_str().unwrap_or("-")),
                                ip = headers
                                    .get("x-forwarded-for")
                                    .map_or("-", |x| x.to_str().unwrap_or("-")),
                            );
                        })
                        .on_response(|response: &Response<_>, latency, span: &Span| {
                            span.record("dur", field::debug(latency));
                            info!(
                                target: "request",
                                "END {status}",
                                status = response.status().as_u16(),
                            );
                        })
                        .on_body_chunk(())
                        .on_eos(|_trailers: Option<&_>, stream_duration, span: &Span| {
                            span.record("dur", field::debug(stream_duration));
                            debug!(
                                target: "request",
                                "ERR: stream closed unexpectedly",
                            );
                        })
                        .on_failure(|error, latency, span: &Span| {
                            span.record("dur", field::debug(latency));
                            debug!(
                                target: "request",
                                err = ?error,
                                "ERR: something went wrong",
                            );
                        }),
                )
                .layer(TimeoutLayer::new(Duration::from_secs(60)))
                .layer(PropagateRequestIdLayer::x_request_id())
                .layer(SetResponseHeaderLayer::appending(
                    header::DATE,
                    |_response: &Response<_>| {
                        Some(
                            chrono::Utc::now()
                                .to_rfc2822()
                                .parse()
                                .expect("Invalid date"),
                        )
                    },
                )),
        )
        .layer(
            CorsLayer::new()
                .allow_methods(cors::AllowMethods::mirror_request())
                .allow_origin(cors::AllowOrigin::mirror_request()),
        )
}
