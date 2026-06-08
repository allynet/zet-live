use std::{
    string::ToString,
    sync::{Arc, LazyLock},
    time::Duration,
};

use tokio::sync::Notify;
use tracing::{debug, trace, warn};

use crate::{cli::Config, database::Database, proto::gtfs_schedule::data::GtfsSchedule};

static DATA_NOTIFICATION: LazyLock<Arc<Notify>> = LazyLock::new(|| Arc::new(Notify::new()));

pub async fn wait_for_schedule_update() {
    DATA_NOTIFICATION.notified().await;
}

#[tracing::instrument(name = "schedule_fetcher")]
pub fn spawn_schedule_fetcher() {
    debug!("Spawning schedule fetcher");

    tokio::spawn(async move {
        let interval = Config::global()
            .global
            .data_fetcher
            .schedule_fetch_interval
            .to_duration(&jiff::Zoned::now())
            .expect("schedule_fetch_interval should be convertible to a duration")
            .unsigned_abs();

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
    #[error("Got database error: {0:?}")]
    Database(#[from] sqlx::Error),
}

async fn fetch_and_update_schedule() -> Result<(), FetcherError> {
    fetch_newer_schedule().await?;
    trace!("Got newer schedule");
    DATA_NOTIFICATION.notify_waiters();
    Ok(())
}

#[tracing::instrument(skip_all)]
async fn fetch_newer_schedule() -> Result<Option<()>, FetcherError> {
    let url = Config::global()
        .global
        .data_fetcher
        .schedule_fetch_endpoint
        .clone();

    debug!(url = ?url.as_str(), "Fetching metadata");

    let response = crate::http_client::HTTP_CLIENT
        .get(url)
        .timeout(Duration::from_mins(1))
        .send()
        .await
        .map_err(FetcherError::Fetch)?;

    if let Err(e) = response.error_for_status_ref() {
        return Err(FetcherError::Fetch(e));
    }

    trace!(headers = ?response.headers(), "Got metadata response.");

    let modified = {
        let ts = response
            .headers()
            .get("last-modified")
            .and_then(|x| x.to_str().ok())
            .and_then(|x| jiff::fmt::rfc2822::parse(x).ok())
            .map_or_else(jiff::Timestamp::now, |zdt| zdt.timestamp());

        #[allow(clippy::cast_precision_loss)]
        let time = ts.as_millisecond() as f64 / 1_000.0;
        time
    };

    let etag = response
        .headers()
        .get("etag")
        .and_then(|x| x.to_str().ok())
        .map(ToString::to_string);

    trace!(?modified, ?etag, "Got schedule metadata");

    let etag_param = etag.clone();
    let res = Database::logged(
        "schedule_meta_check",
        sqlx::query!(
            "SELECT * FROM gtfs_schedule_meta WHERE last_modified >= ? OR etag = ? LIMIT 1",
            modified,
            etag_param,
        )
        .fetch_optional(&Database::pool()),
    )
    .await
    .map_err(FetcherError::Database)?
    .is_some();

    trace!(have_data = ?res, "Checking schedule metadata");

    if res {
        trace!("Schedule is up to date");
        return Ok(None);
    }

    trace!("Schedule is newer");

    let zip_body = response.bytes().await.map_err(FetcherError::Fetch)?;

    trace!(len = ?zip_body.len(), "Got zip body");

    GtfsSchedule::read_from_zip_bytes(zip_body)
        .await
        .map_err(FetcherError::Parse)?;

    debug!("Schedule read to database, committing metadata");

    Database::logged(
        "schedule_meta_insert",
        sqlx::query!(
            "INSERT INTO gtfs_schedule_meta (last_modified, etag) VALUES (?, ?)",
            modified,
            etag,
        )
        .execute(&Database::pool()),
    )
    .await
    .map_err(FetcherError::Database)?;

    debug!("Schedule updated");

    Ok(Some(()))
}
