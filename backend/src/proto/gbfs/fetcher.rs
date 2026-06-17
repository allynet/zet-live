//! Generic periodic fetcher for GBFS feeds.
//!
//! One [`spawn_feed_fetcher`] task is spawned per feed listed in `gbfs.json`.
//! Each task resolves its URL via [`super::discovery`], fetches the feed JSON,
//! persists it via [`super::data::GbfsFeed::write`], and sleeps for
//! `ttl / 2 + jitter(0..=ttl / 4)` before the next cycle (falling back to a
//! 60-second TTL when the feed does not advertise one).

use std::{
    sync::{
        Arc, LazyLock,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use rand::RngExt;
use tokio::sync::Notify;
use tracing::{debug, trace, warn};

use super::data::{Envelope, GbfsFeed};
use crate::{admin, cli::Config, http_client::HTTP_CLIENT, proto::gbfs::discovery};

/// Shared force-sync signal for every GBFS feed fetcher. A single
/// [`force_sync`] fans out to all of them via a generation counter so each
/// task can observe the same force event independently.
static FORCE_SYNC: LazyLock<Arc<Notify>> = LazyLock::new(|| Arc::new(Notify::new()));
static FORCE_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Shared change-notification signal fired after any GBFS feed writes new
/// data. The v1 router awaits it (via [`wait_for_gbfs_update`]) to re-read the
/// GBFS tables and broadcast a fresh snapshot over WebSocket. `Notify`
/// coalesces bursts, so a startup flurry of feed writes results in few wakes;
/// the DB is always re-read on wake so the snapshot is eventually consistent
/// even if a notify lands while the listener is busy.
static GBFS_NOTIFICATION: LazyLock<Arc<Notify>> = LazyLock::new(|| Arc::new(Notify::new()));

const DEFAULT_TTL: jiff::SignedDuration = jiff::SignedDuration::from_mins(1);

/// Force every GBFS feed fetcher to refresh out-of-cycle.
pub fn force_sync() {
    FORCE_GENERATION.fetch_add(1, Ordering::Relaxed);
    FORCE_SYNC.notify_waiters();
}

/// Wait until any GBFS feed has written newer data. Returns immediately once
/// per notify; callers then re-read what they need from the database.
pub async fn wait_for_gbfs_update() {
    GBFS_NOTIFICATION.notified().await;
}

/// Spawn one periodic fetcher per GBFS feed.
///
/// Each feed runs in its own task with a TTL-driven interval. This is
/// non-blocking: the server does not wait for any GBFS feed before serving.
pub fn spawn_all_feed_fetchers() {
    debug!("Spawning GBFS feed fetchers");
    spawn_feed_fetcher::<super::data::system_information::Feed>();
    spawn_feed_fetcher::<super::data::vehicle_types::Feed>();
    spawn_feed_fetcher::<super::data::station_information::Feed>();
    spawn_feed_fetcher::<super::data::station_status::Feed>();
    spawn_feed_fetcher::<super::data::system_hours::Feed>();
    spawn_feed_fetcher::<super::data::system_regions::Feed>();
    spawn_feed_fetcher::<super::data::system_pricing_plans::Feed>();
}

/// Spawn the periodic fetch loop for a single GBFS feed.
pub fn spawn_feed_fetcher<F: GbfsFeed>() {
    debug!(feed = F::FEED_NAME, "Spawning GBFS feed fetcher");

    tokio::task::spawn(async move {
        let min_interval = Config::global()
            .global
            .data_fetcher
            .gbfs_min_fetch_interval
            .to_duration(&jiff::Zoned::now())
            .expect("gbfs_min_fetch_interval should be convertible to a duration")
            .unsigned_abs();

        let mut previous_last_updated = jiff::Timestamp::default();
        let mut current_ttl = DEFAULT_TTL;
        let mut force_generation = 0;

        loop {
            let current = FORCE_GENERATION.load(Ordering::Relaxed);
            let forced = current != force_generation;
            force_generation = current;
            let paused = admin::ADMIN_SETTINGS
                .read()
                .await
                .gbfs_paused
                .unwrap_or(false);

            if paused && !forced {
                trace!(feed = F::FEED_NAME, "GBFS fetching paused, skipping");
                admin::metadata::write_metadata(
                    F::METADATA_NAME,
                    &admin::metadata::MetadataEntry::paused(),
                )
                .await;
            } else {
                match fetch_and_write::<F>(previous_last_updated, forced).await {
                    Ok(Some(result)) => {
                        previous_last_updated = result.last_updated;
                        if let Some(observed_ttl) = result.ttl {
                            current_ttl = observed_ttl.max(jiff::SignedDuration::from_secs(1));
                        }
                        debug!(feed = F::FEED_NAME, last_updated = ?result.last_updated, "Got newer GBFS feed");
                        trace!("Notifying GBFS listeners");
                        GBFS_NOTIFICATION.notify_waiters();
                    }
                    Ok(None) => {}
                    Err(e) => {
                        warn!(feed = F::FEED_NAME, error = %e, "Failed to fetch GBFS feed");
                    }
                }
            }

            let sleep = compute_sleep(current_ttl, min_interval);
            trace!(
                feed = F::FEED_NAME,
                ?sleep,
                "Sleeping before next GBFS fetch"
            );

            tokio::select! {
                () = tokio::time::sleep(sleep) => {}
                () = FORCE_SYNC.notified() => {
                    trace!(feed = F::FEED_NAME, "Force sync triggered");
                }
            }
        }
    });
}

/// Compute the next sleep duration: `ttl / 2 + jitter(0..=ttl / 4)`, floored to
/// `min_interval`.
fn compute_sleep(ttl: jiff::SignedDuration, min_interval: Duration) -> Duration {
    let ttl_secs = ttl.unsigned_abs();
    let ttl_half = ttl_secs / 2;
    let jitter_max = ttl_secs / 4;

    let mut rng = rand::rng();
    let jitter_msec = if jitter_max.as_millis() == 0 {
        0
    } else {
        rng.random_range(0..=jitter_max.as_millis())
    };

    let ttl_msec = u64::try_from(ttl_half.as_millis() + jitter_msec).unwrap_or(30_000);

    Duration::from_millis(ttl_msec).max(min_interval)
}

#[derive(Debug, Clone, Copy)]
struct FetchResult {
    last_updated: jiff::Timestamp,
    ttl: Option<jiff::SignedDuration>,
}

#[tracing::instrument(skip_all, fields(feed = F::FEED_NAME))]
async fn fetch_and_write<F: GbfsFeed>(
    previous_last_updated: jiff::Timestamp,
    forced: bool,
) -> Result<Option<FetchResult>, FetcherError> {
    trace!("Fetching GBFS feed");
    let start = Instant::now();

    admin::metadata::write_metadata(
        F::METADATA_NAME,
        &admin::metadata::MetadataEntry::in_progress(),
    )
    .await;

    let Some(url) = discovery::resolve_feed_url(F::FEED_NAME).await else {
        admin::metadata::write_metadata(
            F::METADATA_NAME,
            &admin::metadata::MetadataEntry::error()
                .with_error_message(format!("feed {} is not present in gbfs.json", F::FEED_NAME))
                .with_duration(start.elapsed()),
        )
        .await;
        return Ok(None);
    };

    let response = HTTP_CLIENT
        .get(url)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(FetcherError::Fetch)?;

    trace!(status = ?response.status(), "Got GBFS feed response");

    if let Err(e) = response.error_for_status_ref() {
        admin::metadata::write_metadata(
            F::METADATA_NAME,
            &admin::metadata::MetadataEntry::error()
                .with_error_message(e.to_string())
                .with_duration(start.elapsed()),
        )
        .await;
        return Err(FetcherError::Fetch(e));
    }

    let envelope: Envelope<F::Data> = {
        let bytes = match super::fetch_bytes_capped(response, 30 * 1024 * 1024).await {
            Ok(bytes) => bytes,
            Err(e) => {
                admin::metadata::write_metadata(
                    F::METADATA_NAME,
                    &admin::metadata::MetadataEntry::error()
                        .with_error_message(e.to_string())
                        .with_duration(start.elapsed()),
                )
                .await;
                return Err(FetcherError::Body(e));
            }
        };

        match serde_json::from_slice(&bytes) {
            Ok(envelope) => envelope,
            Err(e) => {
                admin::metadata::write_metadata(
                    F::METADATA_NAME,
                    &admin::metadata::MetadataEntry::error()
                        .with_error_message(e.to_string())
                        .with_duration(start.elapsed()),
                )
                .await;
                return Err(FetcherError::Decode(e));
            }
        }
    };

    let last_updated = jiff::Timestamp::from_second(envelope.last_updated)
        .map_err(FetcherError::TimestampConversion)?;

    trace!(?last_updated, "Got GBFS feed");

    if !forced && last_updated <= previous_last_updated {
        admin::metadata::write_metadata(
            F::METADATA_NAME,
            &admin::metadata::MetadataEntry::skipped().with_duration(start.elapsed()),
        )
        .await;
        trace!("GBFS feed is up to date, skipping");
        return Ok(None);
    }

    let start = Instant::now();
    trace!("Feed data is newer, persisting");
    let count = F::write(envelope.data).await?;
    debug!(took = ?start.elapsed(), count = ?count, "Persisted GBFS feed data");

    admin::metadata::write_metadata(
        F::METADATA_NAME,
        &admin::metadata::MetadataEntry::success()
            .with_duration(start.elapsed())
            .with_records_processed(count as u64),
    )
    .await;

    let ttl = envelope.ttl.map(jiff::SignedDuration::from_secs);

    Ok(Some(FetchResult { last_updated, ttl }))
}

#[derive(Debug, thiserror::Error)]
pub enum FetcherError {
    #[error("Failed to fetch GBFS feed: {0}")]
    Fetch(#[from] reqwest::Error),

    #[error("Failed to read GBFS feed body: {0}")]
    Body(#[from] super::FetchBytesError),

    #[error("Failed to decode GBFS feed JSON: {0}")]
    Decode(#[from] serde_json::Error),

    #[error("Failed to persist GBFS feed data: {0}")]
    Write(#[from] anyhow::Error),

    #[error("Failed to do time conversion: {0}")]
    TimestampConversion(#[from] jiff::Error),
}
