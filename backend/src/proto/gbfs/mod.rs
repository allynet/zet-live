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
