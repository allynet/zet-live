use std::str::FromStr;

use accept_header::Accept;
use axum::{
    http::{HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
};
use mime::Mime;
use once_cell::sync::Lazy;
use prost::bytes::{BufMut, BytesMut};
use reqwest::{StatusCode, header};
use serde::Serialize;

static APPLICATION_CBOR: Lazy<Mime> =
    Lazy::new(|| Mime::from_str("application/cbor").expect("Invalid MIME type"));
pub struct JsonOrAccept<T>(pub T, pub HeaderMap);

impl<T> IntoResponse for JsonOrAccept<T>
where
    T: Serialize,
{
    fn into_response(self) -> Response {
        let headers = self.1;
        let accept = headers
            .get("accept")
            .and_then(|x| x.to_str().ok())
            .map(|x| x.split(','));

        let accept = accept
            .and_then(|mut x| x.find(|x| x == &"application/json" || x == &"application/cbor"))
            .unwrap_or("application/json")
            .parse::<Accept>();
        let Ok(accept) = accept else {
            return (
                StatusCode::NOT_ACCEPTABLE,
                [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))],
            )
                .into_response();
        };

        let cbor: Mime = APPLICATION_CBOR.clone();

        let negotiated = accept
            .negotiate(&[mime::APPLICATION_JSON, cbor.clone()])
            .unwrap_or(mime::APPLICATION_JSON);

        if negotiated == cbor {
            into_cbor_response(self.0)
        } else {
            into_json_response(self.0)
        }
    }
}

fn into_json_response<T>(value: T) -> Response
where
    T: Serialize,
{
    // Use a small initial capacity of 128 bytes like serde_json::to_vec
    // https://docs.rs/serde_json/1.0.82/src/serde_json/ser.rs.html#2189
    let mut buf = BytesMut::with_capacity(128).writer();
    match serde_json::to_writer(&mut buf, &value) {
        Ok(()) => (
            [(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            )],
            buf.into_inner().freeze(),
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))],
            err.to_string(),
        )
            .into_response(),
    }
}

fn into_cbor_response<T>(value: T) -> Response
where
    T: Serialize,
{
    let mut v = Vec::with_capacity(128);
    match value.serialize(&mut minicbor_serde::Serializer::new(&mut v)) {
        Ok(()) => (
            [(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/cbor"),
            )],
            v,
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))],
            err.to_string(),
        )
            .into_response(),
    }
}
