# Plan: Consolidate Time Handling to `jiff`

## Goal

Replace all usages of `chrono` and the custom `Timeframe` enum with `jiff`. The `jiff` crate is already declared in `Cargo.toml` but completely unused. After migration, remove both `chrono` and `Timeframe` entirely.

## Context

The backend currently uses two time-related systems:

1. **`chrono` v0.4.40** (with `serde` feature) — used in 2 files for:
   - HTTP `Date` response header formatting (`chrono::Utc::now().to_rfc2822()`)
   - Parsing `Last-Modified` HTTP header + computing Unix timestamps
2. **`Timeframe`** (custom enum in `backend/src/cli/timeframe.rs`, 106 lines) — used as clap argument types for `data_fetch_interval` and `schedule_fetch_interval`. Parses human-readable strings like `"2 seconds"`, `"1d"`, `"3 months"` and converts to `std::time::Duration`.

`jiff` v0.2.24 (with `serde` feature) is already in `Cargo.toml` but unused.

## Design Decisions

- **Use `jiff::Span` as the clap field type** — `Span` supports both ISO 8601 durations (`PT2S`) and a "friendly" format (`2 seconds`) via `FromStr`. The friendly format accepts the same strings as `Timeframe::parse_str` (e.g. `"2 seconds"`, `"2 minutes"`, `"1d"`, `"3 months"`).
- **Convert `Span` → `std::time::Duration` at usage sites** — `tokio::time::sleep` requires `std::time::Duration`. Use `std::time::Duration::try_from(span)` for time-only spans (seconds, minutes, hours), or `span.to_duration(Zoned::now())?.to_std()?` for spans with calendar units (days, weeks, months).
- **Use `jiff::fmt::rfc2822` for HTTP date formatting/parsing** — replaces `chrono::Utc::now().to_rfc2822()` and `chrono::DateTime::parse_from_rfc2822()`.
- **Use `jiff::Timestamp` for Unix timestamps** — `Timestamp::now()`, `Timestamp::as_second()`, `Timestamp::as_millisecond()` replace chrono equivalents.

## File Operations

### Delete

| File | Reason |
|------|--------|
| `backend/src/cli/timeframe.rs` | Custom `Timeframe` enum replaced by `jiff::Span` |

### Modify

| File | Changes |
|------|---------|
| `backend/src/cli/mod.rs` | Remove `mod timeframe;` and `use timeframe::Timeframe;`. Change `data_fetch_interval` and `schedule_fetch_interval` field types from `Timeframe` to `jiff::Span`. Replace `value_parser = Timeframe::parse_str` with a custom parser function `parse_span` that delegates to `str.parse::<jiff::Span>()`. |
| `backend/src/proto/gtfs_realtime/fetcher.rs` | Replace `Timeframe::into()` (→ `Duration`) with `Duration::try_from(span)` or `span.to_duration(Zoned::now())?.to_std()?`. Add `use jiff::Span;` if needed. |
| `backend/src/proto/gtfs_schedule/fetcher.rs` | Replace `Timeframe::into()` for interval (same as above). Replace `chrono::DateTime::parse_from_rfc2822(x)` with `jiff::fmt::rfc2822::parse(x)`. Replace `chrono::Utc::now()` with `jiff::Timestamp::now()`. Replace `.timestamp()` / `.timestamp_subsec_millis()` with `Timestamp::as_millisecond() as f64 / 1_000.0`. |
| `backend/src/server/routes/mod.rs` | Replace `chrono::Utc::now().to_rfc2822()` with `jiff::fmt::rfc2822::to_string(&jiff::Zoned::now())`. |
| `backend/Cargo.toml` | Remove `chrono` dependency line. |

### Keep Unchanged

| File | Reason |
|------|--------|
| `backend/src/database/mod.rs` | Contains `PRAGMA synchronous = NORMAL;` — "chrono" is a substring of "synchronous", not a library usage. |
| All other `.rs` files | No chrono or Timeframe references. |

## Detailed Changes

### 1. `backend/src/cli/mod.rs`

**Remove:**
```rust
use timeframe::Timeframe;
mod timeframe;
```

**Add:**
```rust
use jiff::Span;
```

**Add custom clap value parser function:**
```rust
fn parse_span(arg: &str) -> Result<Span, String> {
    arg.parse::<Span>().map_err(|e| e.to_string())
}
```

**Change fields:**
```rust
// Before:
pub data_fetch_interval: Timeframe,
pub schedule_fetch_interval: Timeframe,

// After:
pub data_fetch_interval: Span,
pub schedule_fetch_interval: Span,
```

**Change value_parser:**
```rust
// Before:
value_parser = Timeframe::parse_str,

// After:
value_parser = parse_span,
```

### 2. `backend/src/proto/gtfs_realtime/fetcher.rs`

**Replace interval conversion** (lines ~93-98):
```rust
// Before:
let interval: Duration = Config::global()
    .global
    .data_fetcher
    .data_fetch_interval
    .into();

// After:
let interval = Duration::try_from(Config::global()
    .global
    .data_fetcher
    .data_fetch_interval)
    .expect("data_fetch_interval should be convertible to Duration");
```

Note: `Duration::try_from(Span)` works for spans containing only time units (hours, minutes, seconds). For spans with calendar units, use `span.to_duration(jiff::Zoned::now())?.to_std()?`. Since the default values are "2 seconds" and "2 minutes", `Duration::try_from` suffices. For robustness, a helper function or the `to_duration` path could be used.

### 3. `backend/src/proto/gtfs_schedule/fetcher.rs`

**Replace interval conversion** (lines ~20-25): same as above for `schedule_fetch_interval`.

**Replace chrono Last-Modified parsing** (lines ~86-98):
```rust
// Before:
let modified = {
    let x = response
        .headers()
        .get("last-modified")
        .and_then(|x| x.to_str().ok())
        .and_then(|x| chrono::DateTime::parse_from_rfc2822(x).ok())
        .map_or_else(chrono::Utc::now, |x| x.to_utc());

    #[allow(clippy::cast_precision_loss)]
    let time = x.timestamp() as f64;

    time + f64::from(x.timestamp_subsec_millis()) / 1_000.0
};

// After:
let modified = {
    let ts = response
        .headers()
        .get("last-modified")
        .and_then(|x| x.to_str().ok())
        .and_then(|x| jiff::fmt::rfc2822::parse(x).ok())
        .map_or_else(jiff::Timestamp::now, |zdt| zdt.timestamp());

    #[allow(clippy::cast_precision_loss)]
    ts.as_millisecond() as f64 / 1_000.0
};
```

This is cleaner: `Timestamp::as_millisecond()` returns total milliseconds since epoch, so dividing by 1000 gives the same `f64` value as the chrono version.

### 4. `backend/src/server/routes/mod.rs`

**Replace HTTP Date header** (lines ~111-121):
```rust
// Before:
.layer(SetResponseHeaderLayer::appending(
    header::DATE,
    |_response: &Response<_>| {
        Some(
            chrono::Utc::now()
                .to_rfc2822()
                .parse()
                .expect("Invalid date"),
        )
    },
))

// After:
.layer(SetResponseHeaderLayer::appending(
    header::DATE,
    |_response: &Response<_>| {
        Some(
            jiff::fmt::rfc2822::to_string(&jiff::Zoned::now())
                .expect("current time should be formattable as RFC 2822")
                .parse()
                .expect("RFC 2822 string should be a valid HeaderValue"),
        )
    },
))
```

### 5. `backend/Cargo.toml`

**Remove:**
```toml
chrono = { version = "0.4.40", features = ["serde"] }
```

`jiff` stays as-is (already declared with `serde` feature).

## Span → Duration Conversion Details

The conversion from `jiff::Span` to `std::time::Duration` depends on what units the span contains:

| Span units | Conversion method |
|---|---|
| Seconds, minutes, hours only | `Duration::try_from(span)` — works directly |
| Days, weeks, months, years | `span.to_duration(jiff::Zoned::now())?.to_std()?` — needs a relative time |

For the current use case (fetch intervals), the default values are "2 seconds" and "2 minutes" — both time-only spans. Users could theoretically specify "1d" or "1 month" as an interval, in which case the `to_duration` path would be needed. The implementation should handle both cases.

**Helper function approach:**
```rust
fn span_to_duration(span: Span) -> Duration {
    Duration::try_from(span)
        .or_else(|_| {
            let signed = span.to_duration(jiff::Zoned::now())?;
            signed.to_std()
        })
        .expect("failed to convert span to duration")
}
```

Alternatively, always use `span.to_duration(jiff::Zoned::now())?.to_std()?` which works for all cases.

## API Compatibility

| chrono API | jiff equivalent |
|---|---|
| `chrono::Utc::now()` | `jiff::Timestamp::now()` (for timestamps) / `jiff::Zoned::now()` (for formatted output) |
| `chrono::Utc::now().to_rfc2822()` | `jiff::fmt::rfc2822::to_string(&jiff::Zoned::now())` |
| `chrono::DateTime::parse_from_rfc2822(s)` | `jiff::fmt::rfc2822::parse(s)` (returns `Zoned`) |
| `.to_utc()` | `.timestamp()` (Zoned → Timestamp) |
| `.timestamp()` | `Timestamp::as_second()` |
| `.timestamp_subsec_millis()` | N/A — use `Timestamp::as_millisecond()` for total ms since epoch |
| `Timeframe::parse_str(s)` | `s.parse::<jiff::Span>()` (built-in friendly format support) |
| `Timeframe` → `Duration` via `From` | `Duration::try_from(span)` or `span.to_duration(Zoned::now())?.to_std()?` |

## Implementation Order

1. Write plan to `docs/plans/03-migrate-to-jiff.md`
2. Delete `backend/src/cli/timeframe.rs`
3. Update `backend/src/cli/mod.rs` — remove Timeframe, add Span with custom parser
4. Update `backend/src/proto/gtfs_realtime/fetcher.rs` — new Span → Duration conversion
5. Update `backend/src/proto/gtfs_schedule/fetcher.rs` — replace chrono with jiff + new interval conversion
6. Update `backend/src/server/routes/mod.rs` — replace chrono with jiff for Date header
7. Remove `chrono` from `backend/Cargo.toml`
8. Run `just fmt-dev` to verify compilation and lints

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `Span::from_str` friendly format differs from `Timeframe::parse_str` | Tested: jiff accepts `"2 seconds"`, `"2 minutes"`, `"1d"`, `"3 months"` etc. — same formats. Jiff also accepts ISO 8601 (`PT2S`) as a bonus. |
| `Duration::try_from(Span)` fails for calendar-unit spans | Use `span.to_duration(Zoned::now())?.to_std()?` which handles all cases. For default values (time-only), `try_from` works directly. |
| RFC 2822 output format differs slightly | `jiff::fmt::rfc2822::to_string` produces standard RFC 2822 format — functionally identical to chrono for HTTP headers. |
| `Timestamp::as_millisecond()` precision | Returns `i128` — dividing by 1000.0 to `f64` may lose precision for extreme values. Negligible for current-era timestamps (millions of ms). |
| Clap `value_parser` function signature | `fn(&str) -> Result<T, String>` — exactly what clap expects. `parse_span` delegates to `Span::from_str` and maps errors. |
