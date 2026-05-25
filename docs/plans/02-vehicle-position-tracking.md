# Plan: Track Previous Vehicle Positions

## Goal

Track the previous position of each vehicle across feed cycles to enable future direction-of-travel and route-progress features. Apply a noise filter (~5m Haversine threshold) to discard insignificant GPS jitter. Also extract `bearing` and `speed` from the GTFS-RT protobuf `Position` message.

## Context

- The backend fetches the GTFS-RT protobuf feed every ~2 seconds
- `process_feed()` currently wipes `live_vehicles` and re-inserts all vehicles each cycle (handles vehicles entering/leaving the feed)
- No previous position, bearing, or speed data is tracked anywhere
- The frontend consumes vehicle data via WebSocket CBOR messages using a **5-element tuple** validated by Zod

## Design Decisions

- **DB is the single source of truth** for previous positions — no extra in-memory state
- **Same delete-all + insert pattern** preserved (handles vehicle churn correctly)
- Before `DELETE ALL`, query current DB rows to get previous positions
- **Noise filter**: if Haversine distance between new and previous position < 5m, keep the old position (don't update current or previous)
- **`to_simple()` appends new fields** to the end of the existing array (indices 0-4 unchanged for backwards compatibility)
- **REST endpoint** now reads from DB (which has enriched data) instead of re-parsing raw protobuf
- **Frontend Zod schema** must be updated to accept extended tuples (`.rest()` on the tuple)

## File Operations

### Create

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/<timestamp>_add-vehicle-tracking.sql` | Drop and recreate `live_vehicles` with PRIMARY KEY + new columns |

### Modify

| File | Changes |
|------|---------|
| `backend/src/entity/util/mixed_value.rs` | Add `Null` variant to `MixedValue` for optional CBOR fields |
| `backend/src/server/routes/v1/_entity/vehicle.rs` | Add `prev_latitude`, `prev_longitude`, `bearing`, `speed` fields; extract from protobuf; update `to_simple()` |
| `backend/src/server/routes/v1/mod.rs` | Query DB for previous positions before delete; apply noise filter; enrich DB inserts; add Haversine helper |
| `backend/src/server/routes/v1/vehicles/mod.rs` | Read from DB instead of re-parsing raw feed |
| `frontend/src/app/entity/v1/message.ts` | Extend vehicle tuple schema with `.rest()` for forward compatibility |
| `frontend/src/app/entity/v1/vehicle.ts` | Update `fromSimple()` to optionally read new fields (with fallbacks) |

## Database Schema

Drop and recreate `live_vehicles`:

```sql
DROP TABLE IF EXISTS live_vehicles;

CREATE TABLE IF NOT EXISTS live_vehicles (
  vehicle_id    TEXT PRIMARY KEY,
  route_id      TEXT,
  trip_id       TEXT,
  latitude      REAL,
  longitude     REAL,
  prev_latitude REAL,
  prev_longitude REAL,
  bearing       REAL,
  speed         REAL
) strict;

CREATE INDEX IF NOT EXISTS idx_live_vehicles__trip_id  ON live_vehicles(trip_id);
CREATE INDEX IF NOT EXISTS idx_live_vehicles__route_id ON live_vehicles(route_id);
```

Changes from previous schema:
- `vehicle_id` is now `PRIMARY KEY` (was unkeyed)
- Added `prev_latitude`, `prev_longitude`, `bearing`, `speed` columns (all nullable)

## Vehicle Struct Changes

Current fields (unchanged): `id`, `route_id`, `trip_id`, `latitude`, `longitude`

New fields: `prev_latitude: Option<f32>`, `prev_longitude: Option<f32>`, `bearing: Option<f32>`, `speed: Option<f32>`

`to_simple()` output (appended fields in bold):

| Index | Type | Field | Notes |
|-------|------|-------|-------|
| 0 | String | id | unchanged |
| 1 | String | route_id | unchanged |
| 2 | String | trip_id | unchanged |
| 3 | F32 | latitude | unchanged |
| 4 | F32 | longitude | unchanged |
| **5** | **F32/Null** | **prev_latitude** | `Null` if no previous position |
| **6** | **F32/Null** | **prev_longitude** | `Null` if no previous position |
| **7** | **F32/Null** | **bearing** | `Null` if not provided by feed |
| **8** | **F32/Null** | **speed** | `Null` if not provided by feed |

## Noise Filter

- **Threshold**: ~5 meters (Haversine distance)
- **Logic**: Before writing vehicles to DB, compare each vehicle's new position with its stored position
  - If distance < 5m: keep stored position as current, don't update `prev_latitude`/`prev_longitude`
  - If distance >= 5m: set `prev_latitude`/`prev_longitude` to stored position, update current to new position
- **First sighting**: vehicle has no stored position → insert with `prev_latitude`/`prev_longitude` as NULL

## process_feed() Flow (Vehicles Task)

```
1. Extract vehicles from protobuf feed (with bearing + speed)
2. Query DB: SELECT vehicle_id, latitude, longitude FROM live_vehicles
   → HashMap<String, (f32, f32)> of previous positions
3. For each vehicle:
   a. Look up previous position from HashMap
   b. If previous exists AND haversine(new, prev) < 5m:
      → keep previous lat/lng as current, don't set prev_*
   c. If previous exists AND haversine >= 5m:
      → prev_lat = old lat, prev_lng = old lng, lat = new lat, lng = new lng
   d. If no previous (new vehicle):
      → lat = new lat, lng = new lng, prev_* = None
4. DELETE FROM live_vehicles
5. INSERT all vehicles with enriched data
6. Serialize + broadcast via WebSocket
```

## Frontend Impact

### Required changes

**1. Zod schema** (`frontend/src/app/entity/v1/message.ts`)

The vehicle tuple is validated as an exact-length `z.tuple([z.string(), z.string(), z.string(), z.number(), z.number()])`. Appending elements will cause validation failure. Fix: use `.rest()` to accept additional elements:

```ts
z.tuple([z.string(), z.string(), z.string(), z.number(), z.number()])
  .rest(z.union([z.string(), z.number(), z.null()]))
```

**2. `fromSimple()`** (`frontend/src/app/entity/v1/vehicle.ts`)

Update to optionally read new fields with fallbacks:

```ts
return new VehicleV1({
  id: String(data[0]),
  routeId: String(data[1]),
  tripId: String(data[2]),
  latitude: Number(data[3]),
  longitude: Number(data[4]),
  // new fields ignored for now — available for future use
});
```

No functional changes to the frontend. The new fields are accepted but not consumed yet.

## REST Endpoint Changes

`GET /api/v1/vehicles` currently re-parses the raw protobuf feed. Since `prev_latitude`/`prev_longitude` are not in the protobuf (they're derived), the endpoint must now read from the DB:

```sql
SELECT vehicle_id, route_id, trip_id, latitude, longitude,
       prev_latitude, prev_longitude, bearing, speed
FROM live_vehicles
```

Deserialize into `Vehicle` structs (with new optional fields) and return as JSON.

## Implementation Order

1. Create new DB migration
2. Add `Null` variant to `MixedValue`
3. Expand `Vehicle` struct + `TryFrom` + `to_simple()`
4. Update `process_feed()` with noise filter + enriched DB writes
5. Update REST endpoint to read from DB
6. Update frontend Zod schema for forward compatibility
7. Verify frontend still works (lint + build)
8. Run backend lint + fmt

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Delete-all + insert loses previous positions | Query DB for current positions BEFORE the delete |
| Vehicles leaving feed leave stale data | Delete-all pattern handles this naturally |
| Frontend breaks from extended tuple | Zod `.rest()` accepts extra elements; `fromSimple()` uses fallbacks |
| First feed cycle after migration has no previous positions | `prev_latitude`/`prev_longitude` are `Option<f32>` / NULL — handled gracefully |
| Haversine computation overhead | Negligible: simple arithmetic on ~500 vehicles every 2s |
