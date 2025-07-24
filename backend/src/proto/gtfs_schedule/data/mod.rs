use std::time::Instant;

use serde::de::DeserializeOwned;

pub mod route;
pub mod shape;
pub mod stop;
pub mod stop_time;
pub mod trip;

pub use route::*;
pub use shape::*;
pub use stop::*;
pub use stop_time::*;
use tracing::{Instrument, debug, trace, warn};
pub use trip::*;

use crate::database::Database;

#[derive(Debug)]
pub struct GtfsSchedule;
impl GtfsSchedule {
    #[allow(clippy::too_many_lines)]
    pub async fn read_from_zip_bytes(zip_bytes: prost::bytes::Bytes) -> Result<(), FileDataError> {
        debug!("Reading GTFS schedule from zip bytes");

        let (query_tx, mut query_rx) = tokio::sync::mpsc::unbounded_channel::<QueryData>();

        let queries_fut = tokio::task::spawn(
            async move {
                let tx = Database::conn().lock().await
                    .transaction_with_behavior(libsql::TransactionBehavior::Immediate)
                    .await?;
                let start = Instant::now();
                debug!("Starting query execution");
                let mut i = 0;
                while let Some(QueryData { query, params }) = query_rx.recv().await {
                    // trace!(query = ?query, params = ?params, "Executing query");
                    let res = tx
                        .execute(&query, params)
                        .await
                        .map_err(FileDataError::DatabaseInsert);
                    if let Err(e) = res {
                        warn!(?query, error = ?e, "Failed to execute query");
                    }
                    i += 1;
                }
                debug!(count = i, took = ?start.elapsed(), "Sent all queries, committing transaction");
                let start = Instant::now();
                let _ = tx.commit().await;
                debug!(took = ?start.elapsed(), "Transaction committed");

                debug!("Vacuuming database");
                let start = Instant::now();
                if let Err(e) = Database::conn().lock().await.execute("VACUUM", libsql::params![]).await {
                    warn!(?e, "Failed to vacuum database");
                } else {
                    debug!(took = ?start.elapsed(), "Database vacuumed");
                }
                Ok::<_, FileDataError>(())
            }
            .instrument(tracing::Span::current()),
        );

        let res = tokio::task::spawn_blocking(move || {
            debug!("Starting csv decoding");

            let start_task = Instant::now();
            let mut zip = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes))
                .map_err(FileDataError::Zip)?;
            trace!(took = ?start_task.elapsed(), "Zip created");

            {
                let start = Instant::now();
                Route::read_from_zip_notif(&mut zip, &query_tx)?;
                trace!(took = ?start.elapsed(), "Routes updated");
            }

            {
                let start = Instant::now();
                Shape::read_from_zip_notif(&mut zip, &query_tx)?;
                trace!(took = ?start.elapsed(), "Shapes updated");
            }

            {
                let start = Instant::now();
                Stop::read_from_zip_notif(&mut zip, &query_tx)?;
                trace!(took = ?start.elapsed(), "Stops updated");
            }

            {
                let start = Instant::now();
                Trip::read_from_zip_notif(&mut zip, &query_tx)?;
                trace!(took = ?start.elapsed(), "Trips updated");
            }

            {
                let start = Instant::now();
                StopTime::read_from_zip_notif(&mut zip, &query_tx)?;
                trace!(took = ?start.elapsed(), "Stop times updated");
            }

            drop(query_tx);

            debug!(took = ?start_task.elapsed(), "CSV data read");

            Ok::<_, FileDataError>(())
        });

        let (parsers, queries) = tokio::join!(res, queries_fut);

        parsers??;
        queries??;

        debug!("Database update complete");

        Ok(())
    }
}

pub struct QueryData {
    query: String,
    params: Vec<(String, Result<libsql::Value, libsql::Error>)>,
}

pub trait FileData: Sized + DeserializeOwned {
    fn file_name() -> &'static str;

    fn table_name() -> &'static str;

    fn into_insert_query(self) -> QueryData;

    fn read_from_zip_notif(
        zip: &mut zip::ZipArchive<std::io::Cursor<prost::bytes::Bytes>>,
        tx: &tokio::sync::mpsc::UnboundedSender<QueryData>,
    ) -> Result<(), FileDataError> {
        let zip_file = zip.by_name(Self::file_name()).map_err(FileDataError::Zip)?;

        trace!(file = ?zip_file.name(), "Reading file");

        let its = csv::ReaderBuilder::new()
            .from_reader(zip_file)
            .into_deserialize::<Self>()
            .filter_map(std::result::Result::ok);

        let mut i = 0;
        let _ = tx.send(QueryData {
            query: format!("delete from {}", Self::table_name()),
            params: vec![],
        });
        for it in its {
            let _ = tx.send(it.into_insert_query());
            i += 1;
        }
        debug!(count = i, table = ?Self::table_name(), "Parsed rows and sent queries");

        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FileDataError {
    #[error("Failed to read from zip: {0:?}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Failed to parse: {0:?}")]
    Parse(#[from] csv::Error),
    #[error("Failed to join blocking task: {0:?}")]
    JoinBlocking(#[from] tokio::task::JoinError),
    #[error("Failed to execute query: {0:?}")]
    DatabaseInsert(#[from] libsql::Error),
    #[error("Failed to execute query: {0:?}")]
    DatabaseSelect(#[from] crate::database::DatabaseError),
}
