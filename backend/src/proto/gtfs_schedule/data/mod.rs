use std::{collections::HashMap, time::Instant};

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
use tracing::{debug, trace, warn};
pub use trip::*;

pub struct GtfsSchedule {
    pub ts: chrono::DateTime<chrono::Utc>,
    pub routes: HashMap<u32, Route>,
    pub shapes: HashMap<String, Vec<SimpleShape>>,
    pub stops: HashMap<String, Stop>,
    pub trips: HashMap<String, Trip>,
}
impl GtfsSchedule {
    pub async fn read_from_zip_bytes(bytes: prost::bytes::Bytes) -> Result<Self, FileDataError> {
        debug!("Reading GTFS schedule from zip bytes");
        tokio::task::spawn_blocking(|| {
            let start_task = Instant::now();
            let mut zip =
                zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(FileDataError::Zip)?;
            trace!(took = ?start_task.elapsed(), "Zip created");

            let start = Instant::now();
            let routes = Route::read_from_zip(&mut zip)?;
            let routes = routes.into_iter().map(|x| (x.id, x)).collect();
            trace!(took = ?start.elapsed(), "Routes read");
            let mut shapes_list = Shape::read_from_zip(&mut zip)?;
            shapes_list.sort_by_key(|x| x.sequence);
            let mut shapes = HashMap::new();
            for shape in shapes_list {
                shapes
                    .entry(shape.id.clone())
                    .or_insert_with(Vec::new)
                    .push(shape.into());
            }
            let start = Instant::now();
            let stops = Stop::read_from_zip(&mut zip)?;
            let mut stops: HashMap<String, Stop> =
                stops.into_iter().map(|x| (x.id.clone(), x)).collect();
            trace!(took = ?start.elapsed(), "Stops read");
            let start = Instant::now();
            let trips = Trip::read_from_zip(&mut zip)?;
            let mut trips: HashMap<String, Trip> =
                trips.into_iter().map(|x| (x.id.clone(), x)).collect();
            trace!(took = ?start.elapsed(), "Trips read");
            let start = Instant::now();
            let mut stop_times = StopTime::read_from_zip(&mut zip)?;
            stop_times.sort_by_key(|x| x.stop_sequence);
            trace!(took = ?start.elapsed(), "Stop times read");
            let start = Instant::now();
            for stop_time in stop_times {
                if let Some(trip) = trips.get_mut(&stop_time.trip_id) {
                    trip.stop_ids.push(stop_time.stop_id.clone());
                } else {
                    warn!("Trip {} not found", stop_time.trip_id);
                }
                if let Some(stop) = stops.get_mut(&stop_time.stop_id) {
                    stop.trip_ids_stop_here.push(stop_time.trip_id.clone());
                } else {
                    warn!("Stop {} not found", stop_time.stop_id);
                }
            }
            trace!(took = ?start.elapsed(), "Stop times processed");

            Ok(Self {
                ts: chrono::Utc::now(),
                routes,
                shapes,
                stops,
                trips,
            })
        })
        .await
        .map_err(FileDataError::JoinBlocking)?
    }

    pub const fn get_ts(&self) -> u64 {
        #[allow(clippy::cast_sign_loss)]
        {
            self.ts.timestamp() as u64
        }
    }
}

pub trait FileData: Sized + DeserializeOwned {
    fn file_name() -> &'static str;

    fn read_from_zip(
        zip: &mut zip::ZipArchive<std::io::Cursor<prost::bytes::Bytes>>,
    ) -> Result<Vec<Self>, FileDataError> {
        let mut reader =
            csv::Reader::from_reader(zip.by_name(Self::file_name()).map_err(FileDataError::Zip)?);
        Ok(Self::parse(&mut reader))
    }

    fn parse<R>(reader: &mut csv::Reader<zip::read::ZipFile<'_, R>>) -> Vec<Self>
    where
        R: std::io::Read + std::io::Seek,
    {
        reader
            .deserialize::<Self>()
            .filter_map(std::result::Result::ok)
            .collect::<Vec<_>>()
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
}
