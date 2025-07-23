use std::sync::Arc;

use include_dir::{Dir, include_dir};
use libsql::Builder;
use once_cell::sync::OnceCell;
use tracing::{debug, error, trace};

use crate::cli::DatabaseUrl;

pub mod entities;

static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/src/database/migrations");
static DATABASE: OnceCell<Arc<Database>> = OnceCell::new();

pub struct Database {
    conn: libsql::Connection,
}
impl Database {
    pub async fn init(url: &DatabaseUrl) -> Result<Arc<Self>, Box<dyn std::error::Error>> {
        let now = std::time::Instant::now();
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

        let database = Self { conn };
        database.run_migrations().await?;

        DATABASE
            .set(Arc::new(database))
            .map_err(|_| "Failed to initialize database")?;
        debug!(took = ?now.elapsed(), "Database initialized");

        Ok(Self::global())
    }

    async fn run_migrations(&self) -> Result<(), Box<dyn std::error::Error>> {
        let now = std::time::Instant::now();

        let mut migrations = MIGRATIONS
            .entries()
            .iter()
            .filter_map(|x| x.as_file())
            .collect::<Vec<_>>();
        migrations.sort_by_key(|x| x.path());

        debug!(count = migrations.len(), "Running migrations");

        for migration in migrations {
            let Some(content) = migration.contents_utf8() else {
                error!(?migration, "Failed to read migration");
                std::process::exit(1);
            };
            debug!(name = ?migration.path(), "Running migration");
            let content = format!("begin transaction; {}; commit;", content);
            self.conn
                .execute_batch(&content)
                .await
                .map_err(|e| format!("Failed to run migration {:?}: {}", migration.path(), e))?;
        }

        debug!(took = ?now.elapsed(), "Migrations complete");

        Ok(())
    }

    pub fn global() -> Arc<Self> {
        DATABASE.get().expect("Database not initialized").clone()
    }

    pub fn conn() -> libsql::Connection {
        Self::global().conn.clone()
    }

    pub async fn query<T: serde::de::DeserializeOwned>(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<Vec<T>, DatabaseError> {
        let mut rows = Self::conn().query(query, params).await?;
        let mut results = vec![];
        while let Ok(Some(row)) = rows.next().await {
            let result = libsql::de::from_row::<T>(&row)?;
            results.push(result);
        }
        Ok(results)
    }

    pub async fn query_one<T: serde::de::DeserializeOwned>(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<Option<T>, DatabaseError> {
        let mut rows = Self::conn().query(query, params).await?;
        let Ok(Some(row)) = rows.next().await else {
            return Ok(None);
        };
        let result = libsql::de::from_row::<T>(&row)?;
        Ok(Some(result))
    }

    pub async fn query_first_columns(
        query: &str,
        params: impl libsql::params::IntoParams,
    ) -> Result<Vec<libsql::Value>, DatabaseError> {
        let mut rows = Self::conn().query(query, params).await?;
        let mut results = vec![];
        while let Ok(Some(row)) = rows.next().await {
            if let Ok(val) = row.get_value(0) {
                results.push(val);
            }
        }
        Ok(results)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("Libsql error: {0:?}")]
    Libsql(#[from] libsql::Error),
    #[error("Failed to deserialize row: {0:?}")]
    Deserialize(#[from] serde::de::value::Error),
}
