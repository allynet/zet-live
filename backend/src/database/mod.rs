use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use include_dir::{Dir, include_dir};
use libsql::Builder;
use once_cell::sync::OnceCell;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use tracing::{debug, error, trace, warn};

use crate::cli::DatabaseUrl;

pub mod entities;

static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/src/database/migrations");
static DATABASE: OnceCell<Arc<Database>> = OnceCell::new();

pub struct Database {
    conn: Arc<Mutex<libsql::Connection>>,
}
impl Database {
    pub async fn init(url: &DatabaseUrl) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        let now = Instant::now();
        debug!(?url, "Initializing database");
        let db = match url {
            DatabaseUrl::Memory => Builder::new_local(":memory:").build().await?,
            DatabaseUrl::Local(path) => Builder::new_local(path).build().await?,
            DatabaseUrl::Remote { url, token } => {
                Builder::new_remote(url.to_string(), token.clone().unwrap_or_default())
                    .build()
                    .await?
            }
        };
        trace!(?db, "Database built");

        if let DatabaseUrl::Local(path) = url {
            let dir_path = path.parent().ok_or("Failed to get parent directory")?;
            let _ = tokio::fs::create_dir_all(dir_path).await;
        }

        trace!("Connecting to database");
        let conn = db.connect()?;
        debug!("Connected to database");

        trace!("Setting up database");
        conn.execute_batch(
            "
            PRAGMA busy_timeout       = 10000;
            PRAGMA journal_mode       = WAL;
            PRAGMA journal_size_limit = 200000000;
            PRAGMA synchronous        = NORMAL;
            PRAGMA foreign_keys       = ON;
            PRAGMA temp_store         = MEMORY;
            PRAGMA cache_size         = -16000;
            PRAGMA auto_vacuum        = INCREMENTAL;
            PRAGMA incremental_vacuum = 1000;
            ",
        )
        .await?;
        trace!("Database setup complete");

        let database = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        database.run_migrations().await?;

        DATABASE
            .set(Arc::new(database))
            .map_err(|_| "Failed to initialize database")?;
        debug!(took = ?now.elapsed(), "Database initialized");

        Ok(Self::global())
    }

    async fn run_migrations(&self) -> Result<(), Box<dyn std::error::Error>> {
        let now = Instant::now();

        let mut migrations = MIGRATIONS
            .entries()
            .iter()
            .filter_map(|x| x.as_file())
            .collect::<Vec<_>>();
        migrations.sort_by_key(|x| x.path());

        let conn = self.conn.lock().await;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS _migrations (
                name       TEXT PRIMARY KEY,
                hash       TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            ",
        )
        .await?;

        let applied: HashMap<String, String> = {
            let mut rows = conn.query("SELECT name, hash FROM _migrations", ()).await?;
            let mut map = HashMap::new();
            while let Ok(Some(row)) = rows.next().await {
                let name: String = row.get(0)?;
                let hash: String = row.get(1)?;
                map.insert(name, hash);
            }
            map
        };

        let mut new_count = 0u32;
        let mut skipped_count = 0u32;

        for migration in &migrations {
            let name = migration
                .path()
                .to_str()
                .ok_or_else(|| format!("Invalid migration path: {:?}", migration.path()))?;

            let Some(content) = migration.contents_utf8() else {
                error!(name, "Failed to read migration");
                std::process::exit(1);
            };

            let hash = hex_digest(content);

            if let Some(stored_hash) = applied.get(name) {
                if stored_hash == &hash {
                    trace!(name, "Migration already applied, skipping");
                    skipped_count += 1;
                    continue;
                }
                error!(
                    name,
                    stored_hash,
                    current_hash = hash,
                    "Migration content has changed since it was applied. Refusing to run to \
                     prevent schema corruption."
                );
                std::process::exit(1);
            }

            debug!(name, "Running migration");
            let batch = format!(
                "begin transaction; {content}; INSERT INTO _migrations (name, hash) VALUES \
                 ('{name}', '{hash}'); commit;"
            );
            conn.execute_batch(&batch)
                .await
                .map_err(|e| format!("Failed to run migration {name}: {e}"))?;
            new_count += 1;
        }

        drop(conn);

        debug!(
            total = migrations.len(),
            new = new_count,
            skipped = skipped_count,
            took = ?now.elapsed(),
            "Migrations complete"
        );

        Ok(())
    }

    pub fn global() -> Arc<Self> {
        DATABASE.get().expect("Database not initialized").clone()
    }

    pub fn conn() -> Arc<Mutex<libsql::Connection>> {
        Self::global().conn.clone()
    }

    #[tracing::instrument(name = "query", skip(params), fields(query))]
    pub async fn query<T: serde::de::DeserializeOwned>(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<Vec<T>, DatabaseError> {
        let (mut rows, start) = Self::execute_query(query, params).await?;
        let mut results = vec![];
        while let Ok(Some(row)) = rows.next().await {
            let result = libsql::de::from_row::<T>(&row)?;
            results.push(result);
        }
        trace_query(query, start);
        Ok(results)
    }

    #[tracing::instrument(name = "query", skip(params), fields(query))]
    pub async fn query_one<T: serde::de::DeserializeOwned>(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<Option<T>, DatabaseError> {
        let (mut rows, start) = Self::execute_query(query, params).await?;
        let Ok(Some(row)) = rows.next().await else {
            return Ok(None);
        };
        let result = libsql::de::from_row::<T>(&row)?;
        trace_query(query, start);
        Ok(Some(result))
    }

    #[tracing::instrument(name = "query", skip(params), fields(query))]
    pub async fn query_first_columns(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<Vec<libsql::Value>, DatabaseError> {
        let (mut rows, start) = Self::execute_query(query, params).await?;
        let mut results = vec![];
        while let Ok(Some(row)) = rows.next().await {
            if let Ok(val) = row.get_value(0) {
                results.push(val);
            }
        }
        trace_query(query, start);
        Ok(results)
    }

    #[tracing::instrument(skip(params), fields(query))]
    pub async fn execute_query(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<(libsql::Rows, Instant), libsql::Error> {
        let conn = Self::conn();
        let lock = conn.lock().await;
        let start = Instant::now();
        let rows = lock.query(query, params).await?;
        drop(lock);
        drop(conn);
        Ok((rows, start))
    }
}

fn trace_query(query: &str, started: Instant) {
    static SLOW_QUERY_THRESHOLD: Duration = Duration::from_millis(20);

    let took = started.elapsed();

    if took > SLOW_QUERY_THRESHOLD {
        let query = query.replace('\n', " ");
        let query = query.trim();

        warn!(?query, ?took, "slow query complete");
    } else if cfg!(debug_assertions) {
        trace!(?query, ?took, "query complete");
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("Libsql error: {0:?}")]
    Libsql(#[from] libsql::Error),
    #[error("Failed to deserialize row: {0:?}")]
    Deserialize(#[from] serde::de::value::Error),
}

fn hex_digest(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}
