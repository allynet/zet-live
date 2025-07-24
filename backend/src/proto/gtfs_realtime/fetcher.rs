use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use once_cell::sync::Lazy;
use prost::Message;
use tokio::sync::{Notify, RwLock};
use tracing::{debug, trace, warn};

use super::data::transit_realtime::FeedMessage;
use crate::cli::Config;

static FEED: Lazy<RwLock<Option<Arc<FeedMessage>>>> = Lazy::new(|| RwLock::new(None));
static FEED_NOTIFICATION: Lazy<Arc<Notify>> = Lazy::new(|| Arc::new(Notify::new()));

pub async fn fetch_feed() -> Result<FeedMessage, FetcherError> {
    let url = Config::global()
        .global
        .data_fetcher
        .data_fetch_endpoint
        .clone();

    debug!(url = ?url.as_str(), "Fetching feed");

    let start = Instant::now();
    let response = reqwest::Client::builder()
        .build()
        .map_err(FetcherError::FetchError)?
        .get(url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(FetcherError::FetchError)?;

    if let Err(e) = response.error_for_status_ref() {
        return Err(FetcherError::FetchError(e));
    }

    trace!(took = ?start.elapsed(), "Got feed response");

    let start_read = Instant::now();
    let body = response.bytes().await.map_err(FetcherError::FetchError)?;
    trace!(took = ?start_read.elapsed(), "Read feed body");

    let start_decode = Instant::now();
    let data = FeedMessage::decode(body).map_err(FetcherError::DecodeError)?;
    trace!(?data.header, took = ?start_decode.elapsed(), "Feed decoded successfully");

    trace!(took = ?start.elapsed(), "Feed fetched successfully");

    Ok(data)
}

pub async fn get_cached_feed() -> Option<Arc<FeedMessage>> {
    FEED.read().await.clone()
}

pub async fn wait_for_feed_update() -> Arc<FeedMessage> {
    FEED_NOTIFICATION.notified().await;

    get_cached_feed().await.expect("Feed should be present")
}

async fn fetch_and_update_feed(after_timestamp: u64) -> Option<u64> {
    let feed = match fetch_feed().await {
        Ok(feed) => feed,
        Err(e) => {
            warn!(error = %e, "Failed to fetch and update feed");
            return None;
        }
    };

    let timestamp = feed.header.timestamp();
    if timestamp <= after_timestamp {
        return None;
    }

    trace!(timestamp = ?timestamp, "Got newer feed");

    *FEED.write().await = Some(Arc::new(feed));

    trace!("Notifying feed fetcher");
    FEED_NOTIFICATION.notify_waiters();

    Some(timestamp)
}

#[tracing::instrument(name = "feed_fetcher")]
pub fn spawn_feed_fetcher() {
    debug!("Spawning feed fetcher");

    tokio::task::spawn(async {
        let interval = Config::global()
            .global
            .data_fetcher
            .data_fetch_interval
            .into();
        trace!(interval = ?interval, "Starting feed fetcher");
        let mut previous_timestamp = 0;
        loop {
            if let Some(new_timestamp) = fetch_and_update_feed(previous_timestamp).await {
                previous_timestamp = new_timestamp;
                debug!(ts = ?new_timestamp, "Got newer feed");
            }

            tokio::time::sleep(interval).await;
        }
    });
}

#[derive(Debug, thiserror::Error)]
pub enum FetcherError {
    #[error("Failed to fetch feed: {0:?}")]
    FetchError(reqwest::Error),

    #[error("Failed to decode feed: {0:?}")]
    DecodeError(prost::DecodeError),
}
