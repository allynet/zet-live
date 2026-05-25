# Plan: Vehicle Next Stop from TripUpdate

## Goal

Calculate the next stop for each live vehicle by parsing `TripUpdate` entities from the GTFS-RT feed. Each `TripUpdate` provides exactly one `stop_time_update` — the next upcoming stop — with stop_id, stop_sequence, and predicted arrival delay. This gives the frontend enough data to also infer the previous stop (sequence - 1) using existing trip stop data from `/api/v1/schedule/trip-info/{trip_id}`.

## Context

- The GTFS-RT feed contains both `VehiclePosition` entities (12 at time of analysis) and `TripUpdate` entities (72 at time of analysis).
- **All** vehicles with positions have matching TripUpdate data (100% overlap by `trip_id`).
- `VehiclePosition.stop_id` and `current_stop_sequence` are **never populated** by ZET (0%).
- `TripUpdate` provides exactly **1 `stop_time_update`** per trip: the next stop with `stop_id`, `stop_sequence`, and optional `arrival.delay` (seconds).
- The existing `gtfs_stop_times` table is populated with full ordered stop sequences per trip, enabling frontend derivation of previous stops from `next_stop_sequence - 1`.

## Design Decisions

- **TripUpdate is the sole source** for next-stop data — VehiclePosition's stop fields are always empty.
- **No previous-stop backend calculation** — the frontend (or API consumers) can derive it from `next_stop_sequence - 1` + the trip's stop list from `gtfs_stop_times` (already exposed via `/api/v1/schedule/trip-info/{trip_id}`).
- **Match vehicles to TripUpdates by `trip_id`** — this is the shared key between `VehiclePosition` and `TripUpdate` entities.
- **Arrival delay included** — `TripUpdate.stop_time_update.arrival.delay` gives seconds relative to scheduled arrival (negative = early, positive = late).
- **Same delete-all + insert pattern** preserved for `live_vehicles`.

## File Operations

### Create

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/<timestamp>_add-next-stop-columns.sql` | Add `next_stop_id`, `next_stop_sequence`, `next_stop_arrival_delay` columns to `live_vehicles` |

### Modify

| File | Changes |
|------|---------|
| `backend/src/server/routes/v1/_entity/vehicle.rs` | Add `next_stop_id`, `next_stop_sequence`, `next_stop_arrival_delay` fields to `Vehicle`; update `to_simple()` |
| `backend/src/server/routes/v1/mod.rs` | Parse TripUpdate entities; build `HashMap<trip_id, NextStopInfo>`; enrich vehicles with next-stop data; update DB writes |
| `backend/src/server/routes/v1/vehicles/mod.rs` | Read new columns from DB in REST endpoint |

## Database Schema

Add columns to existing `live_vehicles`:

```sql
ALTER TABLE live_vehicles ADD COLUMN next_stop_id TEXT;
ALTER TABLE live_vehicles ADD COLUMN next_stop_sequence INTEGER;
ALTER TABLE live_vehicles ADD COLUMN next_stop_arrival_delay INTEGER;
```

All three columns are nullable. `NULL` means no TripUpdate data was available for that vehicle's trip.

## Vehicle Struct Changes

New fields (all optional):

```rust
pub next_stop_id: Option<String>,
pub next_stop_sequence: Option<u32>,
pub next_stop_arrival_delay: Option<i32>,
```

`to_simple()` output (appended fields in bold):

| Index | Type | Field | Notes |
|-------|------|-------|-------|
| 0 | String | id | unchanged |
| 1 | String | route_id | unchanged |
| 2 | String | trip_id | unchanged |
| 3 | F32 | latitude | unchanged |
| 4 | F32 | longitude | unchanged |
| 5 | F32/Null | prev_latitude | unchanged |
| 6 | F32/Null | prev_longitude | unchanged |
| **7** | **String/Null** | **next_stop_id** | `Null` if no TripUpdate match |
| **8** | **U32/Null** | **next_stop_sequence** | `Null` if no TripUpdate match |
| **9** | **I32/Null** | **next_stop_arrival_delay** | `Null` if no arrival prediction |

## TripUpdate Parsing

New in-memory struct (module-local to `mod.rs`):

```rust
struct NextStopInfo {
    stop_id: String,
    stop_sequence: u32,
    arrival_delay: Option<i32>,
}
```

Extraction from feed:

```
for each FeedEntity with trip_update:
    tu = entity.trip_update
    if tu.stop_time_update is non-empty:
        stu = tu.stop_time_update[0]  // ZET always provides exactly 1
        map[tu.trip.trip_id] = NextStopInfo {
            stop_id: stu.stop_id,
            stop_sequence: stu.stop_sequence,
            arrival_delay: stu.arrival.delay,
        }
```

## process_feed() Flow (Updated Vehicles Task)

```
1. Parse TripUpdate entities → HashMap<trip_id, NextStopInfo>
2. Extract VehiclePosition entities → Vec<Vehicle> (existing)
3. Query DB for previous positions (existing)
4. Apply noise filter (existing)
5. For each vehicle:
   a. Look up trip_id in TripUpdate HashMap
   b. If found: set next_stop_id, next_stop_sequence, next_stop_arrival_delay
   c. If not found: all next_stop_* fields remain None
6. DELETE FROM live_vehicles
7. INSERT all vehicles with enriched data (including next_stop columns)
8. Serialize + broadcast via WebSocket
```

## Edge Cases

| Case | Behavior |
|------|----------|
| No TripUpdate for vehicle's trip_id | All `next_stop_*` fields are `None` |
| `next_stop_sequence == 1` | Vehicle hasn't departed first stop yet. Previous stop would be undefined (seq 0 doesn't exist). |
| TripUpdate with empty `stop_time_update` | Treated same as no TripUpdate — `None` |
| TripUpdate `arrival.delay` not set | `next_stop_arrival_delay` is `None`, but `stop_id` and `sequence` may still be present |
| `TripUpdate.schedule_relationship == SKIPPED` or `NO_DATA` | Still extract stop_id/sequence — the vehicle is still heading somewhere. Frontend can filter by schedule_relationship if needed. |

## Frontend Impact

### Required changes

**1. Zod schema** — the vehicle tuple will grow by 3 elements. The existing `.rest()` from plan 02 should already accept these.

**2. `fromSimple()`** — optionally read new fields at indices 7-9 with fallbacks:

```ts
nextStopId: data[7] ? String(data[7]) : null,
nextStopSequence: data[8] != null ? Number(data[8]) : null,
nextStopArrivalDelay: data[9] != null ? Number(data[9]) : null,
```

**3. Previous stop inference** — given `next_stop_sequence`, the frontend can derive the previous stop by looking up the trip's stop list (from existing state/API) at `next_stop_sequence - 1`.

### No functional changes required

The new fields are additive and nullable. Frontend will work without consuming them.

## REST Endpoint Changes

`GET /api/v1/vehicles` reads from `live_vehicles`. Updated query:

```sql
SELECT vehicle_id, route_id, trip_id, latitude, longitude,
       prev_latitude, prev_longitude,
       next_stop_id, next_stop_sequence, next_stop_arrival_delay
FROM live_vehicles
```

## Implementation Order

1. Create DB migration (ALTER TABLE add 3 columns)
2. Expand `Vehicle` struct + `to_simple()`
3. Update `process_feed()` to parse TripUpdates and enrich vehicles
4. Update REST endpoint query to include new columns
5. Run backend lint + fmt
6. Update frontend `fromSimple()` to parse new fields

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| TripUpdate format changes (more than 1 stop_time_update) | Take first element; log warning if >1 |
| trip_id mismatch between VehiclePosition and TripUpdate | Fields remain `None`; already verified 100% overlap in current feed |
| Feed structure changes over time | All fields are `Option<T>` / nullable |
| CBOR serialization of new types (u32, i32 vs MixedValue) | Use existing `MixedValue` variants; add new ones if needed |
