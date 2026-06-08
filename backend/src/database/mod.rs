use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};

use sqlx::{
    AssertSqlSafe, SqlitePool,
    sqlite::{SqliteConnection, SqlitePoolOptions},
};
use tracing::{debug, trace, warn};

use crate::cli::DatabaseUrl;

pub mod sqlx_types;

static DATABASE: OnceLock<SqlitePool> = OnceLock::new();

const SLOW_THRESHOLD: Duration = Duration::from_millis(30);

const CONNECTION_PRAGMAS: &[&str] = &[
    "PRAGMA busy_timeout       = 10000",
    "PRAGMA journal_mode       = WAL",
    "PRAGMA journal_size_limit = 268435456",
    "PRAGMA wal_autocheckpoint = 1000",
    "PRAGMA mmap_size          = 268435456",
    "PRAGMA synchronous        = NORMAL",
    "PRAGMA foreign_keys       = ON",
    "PRAGMA temp_store         = MEMORY",
    "PRAGMA cache_size         = -64000",
    "PRAGMA auto_vacuum        = INCREMENTAL",
    "PRAGMA incremental_vacuum = 1000",
    "PRAGMA optimize           = 0x10002",
];

async fn configure_sqlite_connection(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    for pragma in CONNECTION_PRAGMAS {
        sqlx::query(AssertSqlSafe(*pragma))
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

pub struct Database;

impl Database {
    pub async fn init(url: &DatabaseUrl) -> anyhow::Result<SqlitePool> {
        let connection_string = match url {
            DatabaseUrl::Memory => "sqlite::memory:".to_string(),
            DatabaseUrl::Local(path) => {
                if let Some(parent) = path.parent() {
                    trace!(?parent, "Creating parent directory");
                    let _ = tokio::fs::create_dir_all(parent).await;
                }
                format!("sqlite://{}?mode=rwc", path.display())
            }
        };

        debug!(?connection_string, "Initializing database");

        let pool = SqlitePoolOptions::new()
            .max_connections(20)
            .after_connect(|conn, _meta| {
                Box::pin(async move {
                    configure_sqlite_connection(&mut *conn).await?;
                    Ok(())
                })
            })
            .connect(&connection_string)
            .await?;

        sqlx::migrate!("./migrations").run(&pool).await?;

        DATABASE
            .set(pool.clone())
            .map_err(|_| anyhow::anyhow!("Failed to initialize database, pool already set"))?;

        debug!("Database initialized");

        tokio::task::spawn(Self::run_optimize_periodically());

        Ok(pool)
    }

    pub fn pool() -> SqlitePool {
        DATABASE.get().expect("Database not initialized").clone()
    }
}

impl Database {
    pub async fn logged<F, T>(label: &str, fut: F) -> T
    where
        F: std::future::Future<Output = T>,
    {
        let start = Instant::now();
        let result = fut.await;
        let elapsed = start.elapsed();
        trace!(target: "query", query = label, ?elapsed, "query executed");
        if elapsed > SLOW_THRESHOLD {
            warn!(target: "query", query = label, ?elapsed, "slow query");
        }
        result
    }
}

impl Database {
    pub async fn optimize() {
        debug!("Running optimize on database");
        let start = Instant::now();
        match sqlx::query("PRAGMA optimize").execute(&Self::pool()).await {
            Ok(res) => {
                trace!(?res, took = ?start.elapsed(), "Optimize ran");
            }
            Err(e) => {
                warn!(?e, took = ?start.elapsed(), "Failed to optimize database");
            }
        }
    }

    async fn run_optimize_periodically() {
        loop {
            Self::optimize().await;
            tokio::time::sleep(Duration::from_hours(1)).await;
        }
    }
}
