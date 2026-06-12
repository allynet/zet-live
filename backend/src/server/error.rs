use axum::{
    http::HeaderValue,
    response::{IntoResponse, Response},
};
use reqwest::{StatusCode, header};

#[derive(Debug, serde::Serialize)]
pub struct ApiError {
    pub error: String,
    pub status: u16,
}

impl ApiError {
    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            error: message.into(),
            status: StatusCode::NOT_FOUND.as_u16(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            error: message.into(),
            status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
        }
    }

    pub fn with_status(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            error: message.into(),
            status: status.as_u16(),
        }
    }

    pub fn status_code(&self) -> StatusCode {
        StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = match serde_json::to_string(&self) {
            Ok(body) => body,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    [(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))],
                    err.to_string(),
                )
                    .into_response();
            }
        };

        (
            self.status_code(),
            [(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            )],
            body,
        )
            .into_response()
    }
}
