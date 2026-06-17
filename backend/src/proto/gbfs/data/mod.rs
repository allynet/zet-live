#![allow(clippy::struct_field_names)]

use serde::{Deserialize, de::DeserializeOwned};

pub mod station_information;
pub mod station_status;
pub mod system_hours;
pub mod system_information;
pub mod system_pricing_plans;
pub mod system_regions;
pub mod vehicle_types;

/// A GBFS feed that can be fetched periodically and persisted to the database.
///
/// Each implementing type is a unit struct representing one feed listed in
/// `gbfs.json`. The generic fetcher in [`super::fetcher`] drives the polling
/// loop, invoking [`GbfsFeed::write`] with the decoded payload each cycle.
#[async_trait::async_trait]
pub trait GbfsFeed: Send + Sync + 'static {
    /// The feed name as it appears in the auto-discovery `gbfs.json`
    /// (e.g. `station_status`, `vehicle_types`).
    const FEED_NAME: &'static str;

    /// The admin metadata key used to record per-feed fetch status.
    const METADATA_NAME: &'static str;

    /// The decoded `data` object from the feed envelope.
    type Data: DeserializeOwned + Send + 'static;

    /// Persist the decoded feed payload.
    ///
    /// Returns the number of records written, used for metadata reporting.
    async fn write(data: Self::Data) -> anyhow::Result<usize>;
}

/// The standard GBFS top-level wrapper shared by every feed.
///
/// @see <https://gbfs.org/documentation/gbfs/v2.3#json>.
#[derive(Debug, Deserialize)]
#[serde(bound(deserialize = "T: serde::de::DeserializeOwned"))]
pub struct Envelope<T> {
    pub last_updated: i64,
    #[serde(default)]
    pub ttl: Option<i64>,
    pub data: T,
}
