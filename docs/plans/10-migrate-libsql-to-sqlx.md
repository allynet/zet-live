# Plan: Migrate from libsql to sqlx

## Goal

Replace `libsql` with raw `sqlx` + SQLite as the database layer. Enable compile-time query checking via sqlx macros. Drop remote DB support (Turso). Replace the custom migration runner with `sqlx::migrate!()`.

## Context

The backend uses `libsql` v0.9.30 as its database driver with:
- A custom `Database` singleton wrapping `Arc<RwLock<libsql::Connection>>`
- A hand-written migration runner with SHA-256 content hashing
- `libsql::de::from_row` (serde-based) for row → struct deserialization
- `libsql::named_params!` for parameterized bulk inserts
- `execute_transactional_batch` for atomic multi-statement writes
- `DatabaseUrl::Remote` variant for Turso/libsql cloud (unused in practice)

There are ~40 distinct query/operation sites across 11 files, 14 structs deserialized from DB rows, and 7 `#[repr(u8)]` enums stored as INTEGER columns.

## Design Decisions

- **Raw sqlx, no ORM** — ~40 query sites with complex raw SQL (correlated subqueries, dynamic IN-clauses, generated columns) make an ORM awkward. The existing `Database` wrapper already provides the thin abstraction layer needed.
- **Compile-time checking via sqlx macros** — Static queries use `sqlx::query_as!()` / `sqlx::query!()` for full column/type verification at compile time. Dynamic queries (IN-clauses) use runtime `sqlx::query_as::<_, T>()`.
- **Keep shared structs** — The 5 structs that serve as both DB row targets and API response types (`Route`, `Trip`, `Shape`, `SimpleShape`, `SimpleStop`) get `#[derive(sqlx::FromRow)]` alongside existing serde derives. Per-field `#[sqlx(rename = "...")]` replaces `#[serde(alias = "...")]` for column mapping. Fields absent from the DB get `#[sqlx(skip)]`.
- **Drop remote DB support** — `DatabaseUrl::Remote` is unused in production (containers use `:memory:`). Removing it eliminates the `libsql::Builder::new_remote()` dependency.
- **Replace custom migrator** — `sqlx::migrate!()` handles discovery, ordering, tracking, and checksum validation. Removes need for `include_dir`, `sha2`, `hex` dependencies.
- **Parameterized queries for bulk writes** — The `process_feed` function currently concatenates SQL strings with inline values (SQL injection risk). Refactored to use `sqlx::query(...).bind(...).execute(&mut *tx)` in explicit transactions.
- **Streaming channel with typed structs** — The GTFS bulk loader's MPSC channel currently sends `QueryData` (query string + `Vec<libsql::Value>`). Refactored to send typed struct instances through the channel — they're lightweight (a few dozen bytes each) and the async side calls `sqlx::query(...).bind(...)` per entity. Preserves the streaming benefit for 300+MB raw data.

## File Operations

### Move

| Source | Destination | Reason |
|--------|-------------|--------|
| `backend/src/database/migrations/*.sql` (10 files) | `backend/migrations/*.sql` | sqlx convention — `sqlx::migrate!("./migrations")` resolves relative to `Cargo.toml` |

### Delete

| File | Reason |
|------|--------|
| `backend/src/database/entities/mod.rs` | Empty placeholder, no longer needed |

### Modify

| File | Changes |
|------|---------|
| `backend/Cargo.toml` | Add `sqlx`, remove `libsql`/`sha2`/`hex`/`include_dir`/`webpki-root-certs` |
| `backend/src/database/mod.rs` | Full rewrite: `Database` struct wraps `SqlitePool`, `init()` creates pool with PRAGMAs via `SqlitePoolOptions::after_connect`, runs `sqlx::migrate!()`. Remove `DatabaseError`, `hex_digest`, `MIGRATIONS` static, all migration code, `query`/`query_one`/`query_first_columns`/`execute_query` helpers. Expose `pool()` accessor. |
| `backend/src/cli/mod.rs` | Remove `DatabaseUrl::Remote` variant. Remove `url`/`webpki-root-certs` related parsing. Keep `Memory` and `Local`. |
| `backend/src/proto/gtfs_schedule/data/route.rs` | Add `#[derive(sqlx::FromRow)]` + `#[sqlx(rename)]` on fields. Replace `libsql::named_params!` in `into_insert_query` with a new `insert` method using `sqlx::query().bind()`. |
| `backend/src/proto/gtfs_schedule/data/shape.rs` | Same as route.rs for `Shape`. Add `#[sqlx(rename)]` to `SimpleShape` (fixes latent bug — `latitude`/`longitude` had no aliases for `shape_pt_lat`/`shape_pt_lon`). |
| `backend/src/proto/gtfs_schedule/data/stop.rs` | Same as route.rs for `Stop` and `SimpleStop`. |
| `backend/src/proto/gtfs_schedule/data/trip.rs` | Same as route.rs for `Trip`. |
| `backend/src/proto/gtfs_schedule/data/stop_time.rs` | Same as route.rs for `StopTime`. |
| `backend/src/proto/gtfs_schedule/data/mod.rs` | Replace `QueryData` struct with `BulkInsert` enum. Refactor `FileData` trait to send typed structs through channel. Rewrite `GtfsSchedule::read_from_zip_bytes` to use sqlx transaction with typed inserts. |
| `backend/src/proto/gtfs_schedule/fetcher.rs` | Replace `libsql::named_params!` with `sqlx::query().bind()`. Replace `conn.query()` with `sqlx::query().fetch_optional()`. Replace `conn.execute()` with `sqlx::query().execute()`. |
| `backend/src/server/routes/v1/mod.rs` | Refactor `process_feed`: replace string-concatenated `execute_transactional_batch` with explicit transaction + parameterized `sqlx::query().bind()` calls for vehicle/stop-time inserts. Replace `Database::query`, `Database::query_first_columns`, `Database::conn().read().await.query()` with sqlx equivalents. |
| `backend/src/server/routes/v1/vehicles/mod.rs` | Add `#[derive(sqlx::FromRow)]` to `VehicleRow`. Replace `Database::query` with `sqlx::query_as::<_, VehicleRow>().fetch_all()`. |
| `backend/src/server/routes/v1/schedule/mod.rs` | Add `#[derive(sqlx::FromRow)]` to `ScheduledStopTimeWithNames`, `LiveStopTime`, `StopTripRow`, `BaseMidnightRow`, `StopId`. Replace all `Database::query`/`Database::query_one` calls with sqlx equivalents. |

## Detailed Changes

### 1. `backend/Cargo.toml`

**Add:**
```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "macros"] }
```

**Remove:**
```toml
libsql = "0.9.30"
include_dir = { version = "0.7.4", features = ["metadata"] }
sha2 = "0.11.0"
hex = "0.4.3"
webpki-root-certs = "1.0.7"
```

### 2. `backend/src/database/mod.rs`

**Full rewrite.** The new module:

```rust
use std::sync::{Arc, OnceLock};

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteJournalMode, SqliteSynchronous};
use sqlx::SqlitePool;
use tracing::{debug, trace};

use crate::cli::DatabaseUrl;

static DATABASE: OnceLock<SqlitePool> = OnceLock::new();

pub struct Database;

impl Database {
    pub async fn init(url: &DatabaseUrl) -> Result<SqlitePool, Box<dyn std::error::Error>> {
        let connection_string = match url {
            DatabaseUrl::Memory => "sqlite::memory:".to_string(),
            DatabaseUrl::Local(path) => format!("sqlite://{}?mode=rwc", path.display()),
        };

        let pool = SqlitePoolOptions::new()
            .after_connect(|conn, _meta| Box::pin(async move {
                sqlx::query("
                    PRAGMA busy_timeout       = 10000;
                    PRAGMA journal_mode       = WAL;
                    PRAGMA journal_size_limit = 200000000;
                    PRAGMA synchronous        = NORMAL;
                    PRAGMA foreign_keys       = ON;
                    PRAGMA temp_store         = MEMORY;
                    PRAGMA cache_size         = -16000;
                    PRAGMA auto_vacuum        = INCREMENTAL;
                    PRAGMA incremental_vacuum = 1000;
                ").execute(&mut *conn).await?;
                Ok(())
            }))
            .connect(&connection_string)
            .await?;

        sqlx::migrate!("./migrations").run(&pool).await?;

        DATABASE.set(pool.clone()).map_err(|_| "Failed to initialize database")?;
        Ok(pool)
    }

    pub fn pool() -> SqlitePool {
        DATABASE.get().expect("Database not initialized").clone()
    }
}
```

Key differences from old code:
- `SqlitePool` replaces `Arc<RwLock<libsql::Connection>>` — built-in pooling, no manual locking
- PRAGMAs set in `after_connect` hook (applies per connection in the pool)
- `sqlx::migrate!()` replaces custom migration runner
- No `query`/`query_one`/`query_first_columns`/`execute_query` helpers — callers use sqlx directly
- Slow-query logging: use sqlx's `TRACING` feature or keep manual timing at call sites

### 3. `backend/src/cli/mod.rs`

**Remove `DatabaseUrl::Remote` variant:**
```rust
// Before:
pub enum DatabaseUrl {
    Memory,
    Local(PathBuf),
    Remote { url: url::Url, token: Option<String> },
}

// After:
pub enum DatabaseUrl {
    Memory,
    Local(PathBuf),
}
```

Remove the `Remote` match arm in `try_from_string` and the `url`/`webpki-root-certs` related parsing. Keep `Memory` (`:memory:`) and `Local` (`sqlite:`/`file:`/bare paths).

### 4. sqlx `FromRow` Derives — Shared Structs

For all 5 shared structs, add `#[derive(sqlx::FromRow)]` and per-field `#[sqlx(rename = "...")]` / `#[sqlx(skip)]`.

#### `Route` (`backend/src/proto/gtfs_schedule/data/route.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    #[serde(alias = "route_id")]
    #[sqlx(rename = "route_id")]
    pub id: String,
    #[serde(alias = "agency_id")]
    pub agency_id: Option<String>,
    #[serde(alias = "route_short_name")]
    #[sqlx(rename = "route_short_name")]
    pub short_name: Option<String>,
    #[serde(alias = "route_long_name")]
    #[sqlx(rename = "route_long_name")]
    pub long_name: Option<String>,
    #[serde(alias = "route_desc")]
    #[sqlx(rename = "route_desc")]
    pub desc: Option<String>,
    #[serde(alias = "route_type")]
    #[sqlx(rename = "route_type")]
    pub route_type: RouteType,
    #[serde(alias = "route_url")]
    #[sqlx(rename = "route_url")]
    pub url: Option<url::Url>,
    #[serde(default = "default_route_color")]
    #[serde(alias = "color")]
    #[sqlx(rename = "route_color", default)]
    pub color: String,
    #[serde(default = "default_route_text_color")]
    #[serde(alias = "text_color")]
    #[sqlx(rename = "route_text_color", default)]
    pub text_color: String,
    #[serde(alias = "route_sort_order")]
    #[sqlx(rename = "route_sort_order")]
    pub sort_order: Option<u32>,
    #[serde(default)]
    #[serde(alias = "continuous_pickup")]
    #[sqlx(skip)]
    pub continuous_pickup: PickupType,
    #[serde(default)]
    #[serde(alias = "continuous_drop_off")]
    #[sqlx(skip)]
    pub continuous_drop_off: DropOffType,
    #[serde(alias = "network_id")]
    #[sqlx(skip)]
    pub network_id: Option<String>,
}
```

Notes:
- `route_color` / `route_text_color` in the DB table don't have defaults, but they always have values in practice. The `#[sqlx(default)]` attribute uses `Default::default()` if the column is NULL. The serde `default` attribute is kept for CSV deserialization.
- `continuous_pickup`, `continuous_drop_off`, `network_id`, `sort_order` are marked `#[sqlx(skip)]` since they don't exist as DB columns in `gtfs_routes`. `FromRow` will leave them as `Default::default()`.

#### `Trip` (`backend/src/proto/gtfs_schedule/data/trip.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Trip {
    #[serde(alias = "trip_id")]
    #[sqlx(rename = "trip_id")]
    pub id: String,
    #[serde(alias = "route_id")]
    #[sqlx(rename = "route_id")]
    pub route_id: u32,
    #[serde(alias = "service_id")]
    #[sqlx(rename = "service_id")]
    pub service_id: String,
    #[serde(alias = "trip_headsign")]
    #[sqlx(rename = "trip_headsign")]
    pub headsign: Option<String>,
    #[serde(alias = "trip_short_name")]
    #[sqlx(rename = "trip_short_name")]
    pub short_name: Option<String>,
    #[serde(alias = "direction_id")]
    #[sqlx(rename = "direction_id")]
    pub direction_id: Option<Direction>,
    #[serde(alias = "block_id")]
    #[sqlx(rename = "block_id")]
    pub block_id: Option<String>,
    #[serde(alias = "shape_id")]
    #[sqlx(rename = "shape_id")]
    pub shape_id: Option<String>,
    #[serde(default)]
    #[serde(alias = "wheelchair_accessible")]
    pub wheelchair_boarding: WheelchairBoarding,
    #[serde(default)]
    #[serde(alias = "bikes_allowed")]
    pub bikes_allowed: BikesAllowed,
    #[serde(default)]
    #[serde(alias = "stop_ids")]
    #[sqlx(skip)]
    pub stop_ids: Vec<String>,
}
```

Note: `wheelchair_boarding` field name matches the DB column, so no `#[sqlx(rename)]` needed. The serde alias `wheelchair_accessible` is only for CSV parsing. Same for `bikes_allowed`.

#### `Shape` (`backend/src/proto/gtfs_schedule/data/shape.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Shape {
    #[serde(alias = "shape_id")]
    #[sqlx(rename = "shape_id")]
    pub id: String,
    #[serde(alias = "shape_pt_lat")]
    #[sqlx(rename = "shape_pt_lat")]
    pub latitude: f32,
    #[serde(alias = "shape_pt_lon")]
    #[sqlx(rename = "shape_pt_lon")]
    pub longitude: f32,
    #[serde(alias = "shape_pt_sequence")]
    #[sqlx(rename = "shape_pt_sequence")]
    pub sequence: u32,
    #[serde(alias = "shape_dist_traveled")]
    #[sqlx(rename = "shape_dist_traveled")]
    pub distance: Option<f32>,
}
```

#### `SimpleShape` (`backend/src/proto/gtfs_schedule/data/shape.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SimpleShape {
    #[sqlx(rename = "shape_pt_lat")]
    pub latitude: f32,
    #[sqlx(rename = "shape_pt_lon")]
    pub longitude: f32,
}
```

This fixes the latent bug: `SimpleShape` is used with `SELECT * FROM gtfs_shapes` where columns are `shape_pt_lat`/`shape_pt_lon`, but the struct fields are `latitude`/`longitude` with no serde aliases. The `#[sqlx(rename)]` attributes fix this mapping.

#### `SimpleStop` (`backend/src/proto/gtfs_schedule/data/stop.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SimpleStop {
    #[serde(alias = "stop_id")]
    #[sqlx(rename = "stop_id")]
    pub id: String,
    #[serde(alias = "stop_name")]
    #[sqlx(rename = "stop_name")]
    pub name: String,
    pub latitude: f32,
    pub longitude: f32,
}
```

### 5. sqlx `FromRow` Derives — Local DB-Only Structs

These structs already have field names matching their SQL column names/aliases. Just add the derive:

| Struct | File |
|--------|------|
| `VehicleRow` | `server/routes/v1/vehicles/mod.rs` |
| `ScheduledStopTimeWithNames` | `server/routes/v1/schedule/mod.rs` |
| `LiveStopTime` | `server/routes/v1/schedule/mod.rs` |
| `StopTripRow` | `server/routes/v1/schedule/mod.rs` |
| `BaseMidnightRow` | `server/routes/v1/schedule/mod.rs` |
| `RouteLongNameRow` | `server/routes/v1/mod.rs` (local struct) |
| `TripHeadsignRow` | `server/routes/v1/mod.rs` (local struct) |
| `PrevPosition` | `server/routes/v1/mod.rs` (local struct) |

### 6. Enum Type Implementations

Seven `#[repr(u8)]` enums stored as INTEGER need `sqlx::Type`, `sqlx::Decode`, and `sqlx::Encode` impls for SQLite. Use a macro to reduce boilerplate:

```rust
macro_rules! sqlx_int_enum {
    ($ty:ty) => {
        impl sqlx::Type<sqlx::sqlite::Sqlite> for $ty {
            fn type_info() -> sqlx::sqlite::SqliteTypeInfo {
                <i32 as sqlx::Type<sqlx::sqlite::Sqlite>>::type_info()
            }
            fn is_compatible(ty: &sqlx::sqlite::SqliteTypeInfo) -> bool {
                <i32 as sqlx::Type<sqlx::sqlite::Sqlite>>::is_compatible(ty)
            }
        }
        impl<'q> sqlx::Encode<'q, sqlx::sqlite::Sqlite> for $ty {
            fn encode_by_ref(
                &self,
                buf: &mut Vec<sqlx::sqlite::SqliteArgumentValue<'q>>,
            ) -> sqlx::encode::IsNull {
                buf.push(sqlx::sqlite::SqliteArgumentValue::Int(*self as i32));
                sqlx::encode::IsNull::No
            }
        }
    };
}

macro_rules! sqlx_int_enum_decode {
    ($ty:ty, $try_from:path) => {
        impl<'r> sqlx::Decode<'r, sqlx::sqlite::Sqlite> for $ty {
            fn decode(
                value: sqlx::sqlite::SqliteValueRef<'r>,
            ) -> Result<Self, sqlx::error::BoxDynError> {
                let val = <i32 as sqlx::Decode<'r, sqlx::sqlite::Sqlite>>::decode(value)?;
                $try_from(val).map_err(|e| format!("invalid enum value: {e}").into())
            }
        }
    };
}
```

Applied to:
- `RouteType` (values 0-12, with gaps)
- `Direction` (values 0-1)
- `WheelchairBoarding` (values 0-2)
- `BikesAllowed` (values 0-2)
- `PickupType` (values 0-3)
- `DropOffType` (values 0-2)
- `LocationType` (values 0-4)

The macro impls go in a new `backend/src/database/sqlx_types.rs` module, with `pub use` re-exports if needed, or in the respective data modules.

### 7. Query Conversions — Call Site Patterns

#### Simple SELECT (multi-row)

```rust
// Before:
Database::query::<Route>("SELECT * FROM gtfs_routes", libsql::params![]).await

// After:
sqlx::query_as::<_, Route>("SELECT * FROM gtfs_routes")
    .fetch_all(Database::pool()).await
```

#### Simple SELECT (single-row, optional)

```rust
// Before:
Database::query_one::<Trip>("SELECT * FROM gtfs_trips WHERE trip_id = ?", libsql::params![id]).await

// After:
sqlx::query_as::<_, Trip>("SELECT * FROM gtfs_trips WHERE trip_id = ?")
    .bind(id).fetch_optional(Database::pool()).await
```

#### Dynamic IN-clause

```rust
// Before:
let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
let query = format!("SELECT ... WHERE id IN ({placeholders})");
Database::query::<T>(&query, libsql::params_from_iter(ids.iter().map(String::as_str))).await

// After:
let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
let sql = format!("SELECT ... WHERE id IN ({placeholders})");
let mut q = sqlx::query_as::<_, T>(&sql);
for id in &ids { q = q.bind(id); }
q.fetch_all(Database::pool()).await
```

Note: Dynamic queries cannot use compile-time `sqlx::query_as!` macro — they use runtime `sqlx::query_as::<_, T>()`. Type safety comes from `FromRow` at runtime.

#### First-column extraction

```rust
// Before:
Database::query_first_columns("SELECT DISTINCT stop_id FROM ...", libsql::params![]).await

// After:
let rows: Vec<(String,)> = sqlx::query_as("SELECT DISTINCT stop_id FROM ...")
    .fetch_all(Database::pool()).await?;
let ids: Vec<String> = rows.into_iter().map(|(id,)| id).collect();
```

### 8. Refactor `process_feed` Bulk Writes (`server/routes/v1/mod.rs`)

**Current pattern** (two sites — active trips and vehicles):
1. Concatenate all INSERT/DELETE statements into a single string with inline values
2. Call `execute_transactional_batch(&stmts)`

**New pattern**:
```rust
let mut tx = Database::pool().begin().await?;

// Delete existing data
sqlx::query("DELETE FROM live_trips").execute(&mut *tx).await?;

// Insert trips with bind params
for trip_id in &current_feed_trip_ids {
    sqlx::query("INSERT INTO live_trips (trip_id) VALUES (?)")
        .bind(trip_id)
        .execute(&mut *tx).await?;
}

tx.commit().await?;
```

For vehicles (the larger batch):
```rust
let mut tx = Database::pool().begin().await?;

sqlx::query("DELETE FROM live_vehicles").execute(&mut *tx).await?;
sqlx::query("DELETE FROM live_trip_stop_times").execute(&mut *tx).await?;

for vehicle in &vehicles {
    sqlx::query("
        INSERT INTO live_vehicles
            (vehicle_id, route_id, trip_id, route_long_name, trip_headsign,
             latitude, longitude, prev_latitude, prev_longitude, bearing,
             next_stop_id, next_stop_sequence, next_stop_arrival_delay,
             next_stop_arrival_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")
    .bind(&vehicle.id)
    .bind(&vehicle.route_id)
    .bind(&vehicle.trip_id)
    .bind(&vehicle.route_long_name)
    .bind(&vehicle.trip_headsign)
    .bind(vehicle.latitude)
    .bind(vehicle.longitude)
    .bind(vehicle.prev_latitude)
    .bind(vehicle.prev_longitude)
    .bind(vehicle.bearing)
    .bind(&vehicle.next_stop_id)
    .bind(vehicle.next_stop_sequence)
    .bind(vehicle.next_stop_arrival_delay)
    .bind(vehicle.next_stop_arrival_time)
    .execute(&mut *tx).await?;
}

for (trip_id, stop_times) in &all_stop_times {
    for stu in stop_times {
        sqlx::query("
            INSERT INTO live_trip_stop_times
                (trip_id, stop_id, stop_sequence, arrival_time, arrival_delay)
            VALUES (?, ?, ?, ?, ?)
        ")
        .bind(trip_id)
        .bind(&stu.stop_id)
        .bind(stu.stop_sequence)
        .bind(stu.arrival_time)
        .bind(stu.arrival_delay)
        .execute(&mut *tx).await?;
    }
}

sqlx::query("UPDATE live_feed_metadata SET base_midnight = ? WHERE id = 0")
    .bind(best_base)
    .execute(&mut *tx).await?;

tx.commit().await?;
```

The schedule_offsets query (currently using raw `conn.query()` row iteration) also converts:
```rust
// Before:
let mut rows = Database::conn().read().await.query(&sql, libsql::params_from_iter(param_refs)).await;
while let Ok(Some(row)) = rows.next().await { ... }

// After:
let rows: Vec<(String, u32, i64)> = sqlx::query_as(&sql)
    // bind each trip_id
    .fetch_all(Database::pool()).await?;
```

### 9. Refactor GTFS Bulk Loader (`proto/gtfs_schedule/data/mod.rs`)

**Current**: `spawn_blocking` parses CSV → converts each row to `QueryData` (query string + `Vec<(String, Result<libsql::Value, libsql::Error>)>`) → sends through unbounded MPSC channel → async side executes with `tx.execute(&query, params)`.

**New**: Send typed struct instances through the channel. The structs are already created during CSV parsing — we just stop converting them to `QueryData`.

```rust
enum BulkInsert {
    DeleteAll(&'static str),
    Route(Route),
    Shape(Shape),
    Stop(Stop),
    Trip(Trip),
    StopTime(StopTime),
}
```

Updated `GtfsSchedule::read_from_zip_bytes`:
```rust
pub async fn read_from_zip_bytes(zip_bytes: Bytes) -> Result<(), FileDataError> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<BulkInsert>();

    let queries_fut = tokio::task::spawn(async move {
        let mut tx = Database::pool().begin().await?;

        while let Some(msg) = rx.recv().await {
            match msg {
                BulkInsert::DeleteAll(table) => {
                    sqlx::query(&format!("DELETE FROM {table}"))
                        .execute(&mut *tx).await?;
                }
                BulkInsert::Route(r) => {
                    sqlx::query("INSERT INTO gtfs_routes (...) VALUES (?, ?, ...)")
                        .bind(r.id).bind(r.agency_id) /* ... */
                        .execute(&mut *tx).await?;
                }
                // ... same pattern for Shape, Stop, Trip, StopTime
            }
        }

        tx.commit().await?;

        // VACUUM after commit
        sqlx::query("VACUUM").execute(Database::pool()).await?;
        Ok::<_, FileDataError>(())
    });

    // spawn_blocking side: parse CSV and send structs
    let res = tokio::task::spawn_blocking(move || {
        // ... same CSV parsing, but instead of calling into_insert_query(),
        // send BulkInsert::Route(parsed_route) etc.
        drop(tx);
        Ok::<_, FileDataError>(())
    });

    let (parsers, queries) = tokio::join!(res, queries_fut);
    parsers??;
    queries??;
    Ok(())
}
```

The `FileData` trait changes:
```rust
pub trait FileData: Sized + DeserializeOwned {
    fn file_name() -> &'static str;
    fn table_name() -> &'static str;
    fn into_bulk_insert(self) -> BulkInsert;

    fn read_from_zip_notif(
        zip: &mut ZipArchive<Cursor<Bytes>>,
        tx: &UnboundedSender<BulkInsert>,
    ) -> Result<(), FileDataError> {
        // ... parse CSV rows, send each as BulkInsert
        let _ = tx.send(BulkInsert::DeleteAll(Self::table_name()));
        for it in its {
            let _ = tx.send(it.into_bulk_insert());
        }
        Ok(())
    }
}
```

Each entity type implements `into_bulk_insert`:
```rust
impl FileData for Route {
    fn into_bulk_insert(self) -> BulkInsert { BulkInsert::Route(self) }
    // ...
}
```

Remove `QueryData` struct entirely.

**Memory impact**: Typed structs are lightweight. Each `StopTime` is ~5 fields (2 Strings + u32 + 2 Options). Even for millions of rows, the channel provides backpressure — only a bounded number of structs are in-flight at any time. The total memory footprint is much smaller than the 300+MB raw data.

### 10. Convert `fetcher.rs` Queries

```rust
// Before:
Database::conn().read().await.query(
    "select * from gtfs_schedule_meta where (last_modified >= :modified) or (etag = :etag) limit 1",
    named_params! { ":modified": modified, ":etag": etag.clone() },
).await

// After:
sqlx::query("SELECT * FROM gtfs_schedule_meta WHERE last_modified >= ? OR etag = ? LIMIT 1")
    .bind(modified).bind(etag.clone())
    .fetch_optional(Database::pool()).await
```

```rust
// Before:
Database::conn().write().await.execute(
    "insert into gtfs_schedule_meta (last_modified, etag) values (:last_modified, :etag)",
    named_params! { ":last_modified": modified, ":etag": etag },
).await

// After:
sqlx::query("INSERT INTO gtfs_schedule_meta (last_modified, etag) VALUES (?, ?)")
    .bind(modified).bind(etag)
    .execute(Database::pool()).await
```

### 11. `FileDataError` Update

```rust
// Before:
#[error("Failed to execute query: {0:?}")]
DatabaseInsert(#[from] libsql::Error),
#[error("Failed to execute query: {0:?}")]
DatabaseSelect(#[from] crate::database::DatabaseError),

// After:
#[error("Failed to execute query: {0:?}")]
DatabaseInsert(#[from] sqlx::Error),
```

Remove the `DatabaseSelect` variant (or keep if still used for query errors).

### 12. `FetcherError` Update (in `fetcher.rs`)

```rust
// Before:
#[error("Got database error: {0:?}")]
Database(#[from] libsql::errors::Error),

// After:
#[error("Got database error: {0:?}")]
Database(#[from] sqlx::Error),
```

## Compile-Time Checking Strategy

| Query type | sqlx API | Compile-time? |
|------------|----------|---------------|
| Static SELECTs (known at compile time) | `sqlx::query_as!()` macro | Yes |
| Static INSERTs (bulk loader) | `sqlx::query!()` macro | Yes |
| Dynamic IN-clauses | `sqlx::query_as::<_, T>()` function | No (runtime) |
| Migrations | `sqlx::migrate!()` | N/A |
| PRAGMAs | `sqlx::raw_sql()` | N/A |

For offline checking (no running DB during build):
1. Run `cargo sqlx prepare` after implementing all queries — generates `.sqlx/` directory with cached query metadata
2. Commit `.sqlx/` to git
3. Set `SQLX_OFFLINE=true` env var (or let sqlx auto-detect `.sqlx/` directory)

## Execution Order

1. Update `Cargo.toml` (add sqlx, don't remove libsql yet)
2. Move migration files to `backend/migrations/`
3. Create `backend/src/database/sqlx_types.rs` with enum impls
4. Rewrite `backend/src/database/mod.rs` with SqlitePool
5. Simplify `DatabaseUrl` in `backend/src/cli/mod.rs`
6. Add `#[derive(sqlx::FromRow)]` + `#[sqlx(rename)]` to all 14 structs
7. Convert `server/routes/v1/vehicles/mod.rs` queries
8. Convert `server/routes/v1/schedule/mod.rs` queries
9. Refactor `server/routes/v1/mod.rs` (process_feed + helper queries)
10. Refactor `proto/gtfs_schedule/data/mod.rs` (bulk loader channel)
11. Convert `proto/gtfs_schedule/fetcher.rs` queries
12. Update `FileData` trait and entity `into_insert_query` → `into_bulk_insert`
13. Remove libsql, sha2, hex, include_dir, webpki-root-certs from Cargo.toml
14. Delete `backend/src/database/entities/` directory
15. Run `cargo sqlx prepare` to generate offline query metadata
16. Run `just fmt-dev` to verify compilation and formatting

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| sqlx `FromRow` fails on `SELECT *` when table has extra columns not in struct | sqlx `FromRow` ignores extra columns by default — only the fields present in the struct are read. |
| `url::Url` field in `Route` — sqlx may not support decoding `TEXT` → `Url` directly | Store as `String` in a separate DB-row struct, or implement `sqlx::Decode` for `Url`, or use `#[sqlx(skip)]` and populate from a separate field. Most likely: read as `Option<String>` and convert. |
| Compile-time macros require a running DB or offline metadata | Use `cargo sqlx prepare` for offline mode. During development, use runtime `query_as` until ready to generate metadata. |
| Dynamic IN-clause queries bypass compile-time checking | Accept this tradeoff — the SQL structure is still validated at runtime via `FromRow`. The alternative (sqlx-query-builder) doesn't integrate with `query_as!`. |
| Bulk loader performance — individual `sqlx::query().bind()` per row may be slower than batch | SQLite serializes writes regardless (single writer). The `IMMEDIATE` transaction provides the same batching semantics. If performance is critical, consider `sqlx::query_builder::QueryBuilder` for bulk INSERT syntax (`VALUES (...), (...), (...)`). |
| `f32` fields (latitude/longitude) — sqlx may use `f64` for REAL columns | sqlx's SQLite decoder supports `f32` for REAL columns (performs lossless conversion if value fits). Verified to work. |
| Migration table mismatch — old `_migrations` table vs sqlx's `_sqlx_migrations` | On first run with `sqlx::migrate!()`, all migrations will be treated as new (different tracking table). For `:memory:` databases this is invisible. For file-based dev databases, delete the old DB file once. |
