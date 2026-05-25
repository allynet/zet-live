# Plan: Display All Stop Times

## Goal

Show predicted arrival times for **all upcoming stops** on a vehicle's trip (e.g. "next stop in 1 min, stop after in 3 min, stop after that in 7 min"), not just the next stop. Times are displayed relative to now.

## Context

- The GTFS-RT `TripUpdate` feed provides `StopTimeUpdate` entries per trip. Analysis of the live ZET feed (2026-05-22) shows:
  - 93% of trips have **1** StopTimeUpdate (just the next stop)
  - 6% have **2** StopTimeUpdates
  - <1% have **3** StopTimeUpdates
  - None have more than 3
- Currently only the **first** `StopTimeUpdate` is extracted (`tu.stop_time_update.first()` in `mod.rs:203`).
- The static GTFS schedule (`gtfs_stop_times` table) stores `arrival_time` as `"HH:MM:SS"` strings for every stop on every trip, but these are scheduled (not real-time) and not exposed to the frontend.
- The `TripInfo` endpoint (`/api/v1/schedule/trip-info/{trip_id}`) already returns ordered stop IDs when a vehicle is selected.
- `arrival_time` in `StopTimeUpdate` is `Option<i64>` (absolute Unix timestamp). When present, it's the most accurate prediction. Some STUs only have `delay` (relative seconds), and some only have `departure` data (stop_sequence 1, trip start).

## Design Decisions

- **Two data sources, merged**: Real-time `StopTimeUpdate.arrival.time` where available; computed from `gtfs_stop_times.arrival_time` + nearest known delay for the rest.
- **New table `live_trip_stop_times`**: Stores all parsed StopTimeUpdate entries, bulk-replaced each feed cycle (~2s). Same delete-all + insert pattern as `live_vehicles`.
- **New endpoint `GET /api/v1/schedule/trip-stop-times/{trip_id}`**: Returns predicted arrival times for all stops on a trip, joining real-time data with static schedule. Fetched on-demand when a vehicle is selected (same pattern as existing `trip-info`).
- **Fallback logic**: For stops without real-time data, take the scheduled `arrival_time` from `gtfs_stop_times`, convert to Unix timestamp, and apply the delay from the nearest real-time STU (by `stop_sequence` proximity). If no delay exists, use the scheduled time without adjustment.
- **Relative-to-now display**: All times shown as "now" / "1 min" / "3 min" etc., computed as `round((arrivalTime - Date.now()/1000) / 60)`.
- **Existing vehicle data unchanged**: The `next_stop_*` fields on the `Vehicle` struct and WebSocket broadcast remain as-is (plan 04/05). The new data is fetched separately on vehicle selection.
- **Graceful degradation**: If no real-time or schedule data exists for a stop, no time badge is shown.

## File Operations

### Create

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/<timestamp>_add-live-trip-stop-times.sql` | New `live_trip_stop_times` table |
| `docs/plans/06-all-stop-times.md` | This plan document |

### Modify

| File | Changes |
|------|---------|
| `backend/src/server/routes/v1/mod.rs` | Parse all StopTimeUpdates (not just `.first()`); insert into `live_trip_stop_times`; register new route |
| `backend/src/server/routes/v1/schedule/mod.rs` | New `get_trip_stop_times` handler with schedule fallback |
| `frontend/src/state.ts` | New `tripStopTimesSignal` |
| `frontend/src/hooks/use-stops.ts` | New `fetchTripStopTimes()` function |
| `frontend/src/components/map-container.tsx` | Fetch stop times on vehicle click |
| `frontend/src/components/vehicle-sheet.tsx` | Show time badges for all upcoming stops |
| `frontend/src/app.tsx` | Pass `tripStopTimes` prop; clear signal on dismiss |

### Delete

None.

## Database Schema

New table:

```sql
CREATE TABLE live_trip_stop_times (
    trip_id        TEXT NOT NULL,
    stop_id        TEXT NOT NULL,
    stop_sequence  INTEGER NOT NULL,
    arrival_time   INTEGER,  -- absolute Unix timestamp from GTFS-RT, NULL if not provided
    arrival_delay  INTEGER,  -- seconds delay from GTFS-RT, NULL if not provided
    PRIMARY KEY (trip_id, stop_sequence)
);
```

Bulk-replaced every feed cycle (DELETE all + INSERT), same pattern as `live_vehicles`.

## Backend: Parse All StopTimeUpdates

In `process_feed()` (`mod.rs`), the existing `NextStopInfo` extraction (first STU only) is kept for backward compatibility with vehicle `next_stop_*` fields. A new extraction collects all STUs:

```rust
struct LiveStopTimeInfo {
    stop_id: String,
    stop_sequence: u32,
    arrival_time: Option<i64>,
    arrival_delay: Option<i32>,
}

let all_stop_times: HashMap<String, Vec<LiveStopTimeInfo>> = vehicles_feed.entity
    .iter()
    .filter_map(|x| x.trip_update.as_ref())
    .filter_map(|tu| {
        let trip_id = tu.trip.trip_id().to_string();
        if trip_id.is_empty() { return None; }
        let stus: Vec<_> = tu.stop_time_update.iter()
            .filter_map(|stu| {
                let stop_sequence = stu.stop_sequence?;
                Some(LiveStopTimeInfo {
                    stop_id: stu.stop_id().to_string(),
                    stop_sequence,
                    arrival_time: stu.arrival.as_ref().and_then(|a| a.time),
                    arrival_delay: stu.arrival.as_ref().and_then(|a| a.delay),
                })
            })
            .collect();
        if stus.is_empty() { return None; }
        Some((trip_id, stus))
    })
    .collect();
```

Insert into `live_trip_stop_times` as batch SQL (prepend `DELETE FROM live_trip_stop_times;` before the vehicle inserts).

## Backend: New Endpoint

`GET /api/v1/schedule/trip-stop-times/{trip_id}`

Response:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TripStopTime {
    stop_id: String,
    stop_sequence: u32,
    stop_name: String,
    arrival_time: Option<i64>,  // predicted absolute Unix time
}
```

Logic:

1. Query `gtfs_stop_times` for the trip to get all stops with scheduled `arrival_time` strings, ordered by `stop_sequence`.
2. Query `live_trip_stop_times` for the trip to get real-time predictions.
3. Find the "reference delay": use the delay from the nearest real-time STU (by `stop_sequence` proximity). If only absolute `arrival_time` is available (no delay), compute delay as `realtime_arrival_time - scheduled_arrival_time`.
4. For each stop:
   - If real-time `arrival_time` exists → use it directly.
   - If real-time `arrival_delay` exists but no `arrival_time` → compute `scheduled_time + delay`.
   - If no real-time data → apply reference delay to scheduled time.
   - If no scheduled time and no real-time data → `None`.
5. Join with `gtfs_stops` for `stop_name`.
6. Return ordered by `stop_sequence`.

### Parsing scheduled `arrival_time`

GTFS `arrival_time` is `"HH:MM:SS"` (can exceed 24:00:00 for trips past midnight). Helper function:

```rust
fn parse_gtfs_time_to_unix(time_str: &str, date: NaiveDate) -> Option<i64> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    let hours: i64 = parts.first()?.parse().ok()?;
    let minutes: i64 = parts.get(1)?.parse().ok()?;
    let seconds: i64 = parts.get(2)?.parse().ok()?;
    let datetime = date.and_hms_opt(0, 0, 0)?;
    Some(datetime.and_utc().timestamp() + hours * 3600 + minutes * 60 + seconds)
}
```

The date is derived from the trip's `start_date` (from the feed) or falls back to today.

## Frontend: New Signal

`state.ts`:

```ts
export const tripStopTimesSignal = signal<Map<string, number> | null>(null);
// Maps stopId → predicted arrival Unix seconds (absolute)
```

## Frontend: Fetch Function

`use-stops.ts`:

```ts
let tripStopTimesAbort: AbortController | null = null;

export async function fetchTripStopTimes(tripId: string) {
    tripStopTimesAbort?.abort();
    tripStopTimesAbort = new AbortController();
    const { signal } = tripStopTimesAbort;

    const res = await fetch(`${API_URL}/v1/schedule/trip-stop-times/${tripId}`, { signal });
    const data = await res.json();

    if (signal.aborted) return;

    const map = new Map<string, number>();
    for (const s of data.d) {
        if (s.arrivalTime != null) {
            map.set(s.stopId, s.arrivalTime);
        }
    }
    tripStopTimesSignal.value = map;
}
```

## Frontend: Vehicle Click Handler

`map-container.tsx` — in `handleVehicleClick`, add `fetchTripStopTimes(tripId)` alongside existing `fetchFollowingRoute(tripId)`:

```ts
const handleVehicleClick = useCallback((vehicleId: string, tripId: string) => {
    followingVehicleIdSignal.value = vehicleId;
    followingTripIdSignal.value = tripId;
    followingTripIdsSignal.value = null;
    if (tripId) {
        void fetchFollowingRoute(tripId);
        void fetchTripStopTimes(tripId);
    }
}, []);
```

## Frontend: VehicleSheet Changes

`vehicle-sheet.tsx`:

1. Accept `tripStopTimes: Map<string, number> | null` as new prop.
2. For each stop, look up `tripStopTimes.get(stopId)`:
   - If found, compute minutes from now: `Math.round((arrivalTime - Date.now() / 1000) / 60)`
   - Display as "now" (≤0), "1 min", "X min"
3. Styling:
   - Next stop (existing blue highlight): blue badge with time
   - Subsequent upcoming stops: subtle gray/smaller badge with time
   - Passed stops: no time badge (unchanged)
   - Stops with no data: no time badge

Layout:

```
┌─────────────────────────────────────────────┐
│ [233] Route 233                          [✕] │
├─────────────────────────────────────────────┤
│  · Črnomerec                           (dim)│  ← passed stop
│  ● Sopot                         3 min (bold)│  ← next stop, blue badge
│  · Kvaternikov trg                  7 min     │  ← upcoming, gray badge
│  · Mihaljevac                     10 min     │  ← upcoming, gray badge
│  · ...                                       │  ← scrollable
└─────────────────────────────────────────────┘
```

## Frontend: Cleanup

`app.tsx` — clear `tripStopTimesSignal` on dismiss:

```ts
const dismiss = useCallback(() => {
    // ... existing cleanup ...
    tripStopTimesSignal.value = null;
}, []);
```

Also import and pass `tripStopTimesSignal` to `VehicleSheet`.

## Edge Cases

| Case | Behavior |
|------|----------|
| No real-time data for any stop on trip | All times computed from schedule + no delay (schedule-only) |
| No schedule data for a stop | No time badge shown for that stop |
| Trip start (stop_sequence 1) | Only has departure data; no arrival time to show |
| Negative predicted time (already passed) | Shows "now" |
| Vehicle disappears from feed while selected | Card stays open; data remains until dismissed |
| Multiple STUs with mixed absolute/delay | Absolute `arrival.time` preferred; delay used as fallback |
| Night routes (times > 24:00:00) | GTFS time parser handles hours > 24 |
| Partial feed outages | Gracefully degrades: show times only where data exists |

## Implementation Order

1. Create DB migration (`live_trip_stop_times` table)
2. Update `process_feed()` to parse all STUs + insert into new table
3. Add `get_trip_stop_times` endpoint with schedule fallback
4. Register new route in router
5. Add `tripStopTimesSignal` to `state.ts`
6. Add `fetchTripStopTimes()` to `use-stops.ts`
7. Call `fetchTripStopTimes()` in vehicle click handler
8. Update `VehicleSheet` to show time badges for all upcoming stops
9. Pass data and cleanup in `app.tsx`
10. Run backend fmt + clippy
11. Run frontend lint + format + build

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| ZET feed provides very sparse STU data (only 1-3 per trip) | Schedule fallback fills the gaps |
| Schedule `arrival_time` format varies or is missing | `Option`-based parsing; `None` → no badge |
| Performance of joining live + schedule data on every request | Trip stop lists are small (~20-40 stops); SQLite handles easily |
| Batch SQL for `live_trip_stop_times` slows feed processing | Table is small (~600 rows); same pattern as `live_vehicles` |
| `gtfs_stop_times.arrival_time` stored as text, needs parsing | Helper function with proper error handling |
| Feed date differs from schedule date (e.g. trip spans midnight) | Use trip's `start_date` from feed; fall back to today |
| Frontend shows stale stop times after vehicle update | Signal is re-fetched on vehicle click; could add periodic re-fetch |
