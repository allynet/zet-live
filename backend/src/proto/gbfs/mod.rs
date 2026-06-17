//! GBFS (General Bikeshare Feed Specification) integration.
//!
//! Polls the nextbike HD (Bajs Zagreb) GBFS v2.3 feed. One periodic fetcher is
//! spawned per feed listed in the auto-discovery `gbfs.json`, each driven by its
//! own advertised TTL. See [`fetcher::spawn_all_feed_fetchers`].
//!
//! @see <https://gbfs.org/documentation/gbfs/v2.3>

pub mod data;
pub mod discovery;
pub mod fetcher;

use futures::StreamExt;

#[derive(Debug, thiserror::Error)]
pub enum FetchBytesError {
    #[error("GBFS response body exceeds {0} bytes")]
    TooLarge(usize),

    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

/// Read a response body into a buffer, bailing once it exceeds `max_bytes`.
/// The `Content-Length` header is checked first as a fast path; the streamed
/// chunks are then capped to protect against responses that omit or lie about
/// the header.
pub async fn fetch_bytes_capped(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, FetchBytesError> {
    if response
        .content_length()
        .is_some_and(|len| usize::try_from(len).is_ok_and(|len| len > max_bytes))
    {
        return Err(FetchBytesError::TooLarge(max_bytes));
    }

    let mut stream = response.bytes_stream();
    let mut buf = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if buf.len().saturating_add(chunk.len()) > max_bytes {
            return Err(FetchBytesError::TooLarge(max_bytes));
        }
        buf.extend_from_slice(&chunk);
    }
    Ok(buf)
}
