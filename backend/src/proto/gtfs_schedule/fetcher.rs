use std::{string::ToString, sync::Arc, time::Duration};

use once_cell::sync::Lazy;
use tokio::sync::{Notify, RwLock};
use tracing::{debug, trace, warn};

use crate::{cli::Config, proto::gtfs_schedule::data::GtfsSchedule};

static GTFS_SCHEDULE: Lazy<RwLock<Option<Arc<GtfsSchedule>>>> = Lazy::new(|| RwLock::new(None));
static DATA_NOTIFICATION: Lazy<Arc<Notify>> = Lazy::new(|| Arc::new(Notify::new()));
static LAST_FETCH_INFO: Lazy<RwLock<FetchInfo>> = Lazy::new(|| RwLock::new(FetchInfo::default()));

#[derive(Debug, Default)]
struct FetchInfo {
    modified: Option<chrono::DateTime<chrono::FixedOffset>>,
    etag: Option<String>,
}

pub async fn get_cached_schedule() -> Option<Arc<GtfsSchedule>> {
    GTFS_SCHEDULE.read().await.clone()
}

pub async fn wait_for_schedule_update() -> Arc<GtfsSchedule> {
    DATA_NOTIFICATION.notified().await;

    get_cached_schedule()
        .await
        .expect("Schedule should be present")
}

#[tracing::instrument(name = "schedule_fetcher")]
pub fn spawn_schedule_fetcher() {
    debug!("Spawning schedule fetcher");

    tokio::spawn(async move {
        let interval = Config::global()
            .global
            .data_fetcher
            .schedule_fetch_interval
            .into();

        trace!(interval = ?interval, "Starting schedule fetcher");
        loop {
            if let Err(e) = fetch_and_update_schedule().await {
                warn!(error = %e, "Failed to fetch and update schedule");
                tokio::time::sleep(interval / 5).await;
                continue;
            }

            tokio::time::sleep(interval).await;
        }
    });
}

#[derive(Debug, thiserror::Error)]
pub enum FetcherError {
    #[error("Failed to fetch metadata: {0:?}")]
    Fetch(reqwest::Error),
    #[error("Failed to open zip file: {0:?}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Failed to spawn blocking task: {0:?}")]
    JoinBlocking(#[from] tokio::task::JoinError),
    #[error("Failed to parse file: {0:?}")]
    Parse(#[from] super::data::FileDataError),
}

async fn fetch_and_update_schedule() -> Result<(), FetcherError> {
    let schedule = fetch_newer_metadata().await?;
    if let Some(schedule) = schedule {
        GTFS_SCHEDULE.write().await.replace(Arc::new(schedule));
        DATA_NOTIFICATION.notify_waiters();
    }
    Ok(())
}

async fn fetch_newer_metadata() -> Result<Option<GtfsSchedule>, FetcherError> {
    let url = Config::global()
        .global
        .data_fetcher
        .schedule_fetch_endpoint
        .clone();

    debug!(url = ?url.as_str(), "Fetching metadata");

    let response = reqwest::Client::builder()
        .build()
        .map_err(FetcherError::Fetch)?
        .get(url)
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(FetcherError::Fetch)?;

    if let Err(e) = response.error_for_status_ref() {
        return Err(FetcherError::Fetch(e));
    }

    trace!(headers = ?response.headers(), "Got metadata response.");

    {
        let modified = response
            .headers()
            .get("last-modified")
            .and_then(|x| x.to_str().ok())
            .and_then(|x| chrono::DateTime::parse_from_rfc2822(x).ok());

        let etag = response
            .headers()
            .get("etag")
            .and_then(|x| x.to_str().ok())
            .map(ToString::to_string);

        let last_fetch_info = LAST_FETCH_INFO.read().await;
        let last_modified_is_newer = match (last_fetch_info.modified, modified) {
            (Some(last_modified), Some(modified)) => last_modified < modified,
            (None, Some(_) | None) => true,
            (Some(_), None) => false,
        };
        let etag_changed = match (last_fetch_info.etag.clone(), etag.clone()) {
            (Some(last_etag), Some(etag)) => last_etag != etag,
            _ => true,
        };
        if !last_modified_is_newer && !etag_changed {
            return Ok(None);
        }
        drop(last_fetch_info);

        let mut last_fetch_info = LAST_FETCH_INFO.write().await;
        last_fetch_info.modified = modified;
        last_fetch_info.etag = etag;
    }

    let zip_body = response.bytes().await.map_err(FetcherError::Fetch)?;

    let schedule = GtfsSchedule::read_from_zip_bytes(zip_body)
        .await
        .map_err(FetcherError::Parse)?;

    Ok(Some(schedule))
}
