# Plan: Vehicle Bottom Sheet

## Goal

Display a bottom-sheet card when a vehicle is selected, showing the vehicle's full route (ordered stop names) with the next stop highlighted and an arrival time indicator ("3 min" or "+2 min"). Rename the existing `StopCard` component to `BottomSheet` since it now serves both stop and vehicle selection modes.

## Context

- The backend already sends `next_stop_id`, `next_stop_sequence`, and `next_stop_arrival_delay` per vehicle via WebSocket (10-element tuple, indices 7-9). However, `StopTimeEvent.time` (absolute Unix timestamp of estimated arrival) is not yet extracted — only `delay` (relative seconds) is captured.
- The frontend's `VehicleV1.fromSimple()` only reads the first 5 elements (id, routeId, tripId, lat, lng). Fields at indices 5-9 are silently ignored.
- When a vehicle is clicked, `fetchFollowingRoute(tripId)` already fetches the trip's ordered stop list via `/api/v1/schedule/trip-info/{trip_id}` and populates `displayedStopsSignal` with `{ name, lat, lng, ids }` objects in route order.
- The existing `StopCard` component only shows for stop selection. No card appears when a vehicle is selected.
- The Zod schema already uses `.rest(z.unknown())` so longer tuples pass validation without changes.

## Design Decisions

- **Rename `StopCard` → `BottomSheet`** — the component serves both stop and vehicle detail views; name reflects the UI pattern.
- **Add absolute arrival time to backend** — extract `StopTimeEvent.time` from GTFS-RT `TripUpdate` to enable "arrives in 3 min" display. Falls back to delay-only ("+2 min" / "on time") when absolute time is unavailable.
- **Single component, conditional rendering** — the `BottomSheet` checks which selection mode is active (`followingVehicleIdSignal` vs `selectedStopSignal`) and renders the appropriate content. Shared animation and dismiss logic.
- **Scrollable stop list** — the vehicle route can be long; the stop list is scrollable within a max-height container. Passed stops are dimmed, next stop is highlighted with a time badge, upcoming stops are normal.
- **No new API endpoints** — the existing `trip-info` endpoint + WebSocket vehicle data provide everything needed.
- **`nextStopArrivalTime` is `Option<u64>`** — Unix epoch seconds. `None` when the feed doesn't provide it (some feeds only give delay).

## File Operations

### Create

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/<timestamp>_add-next-stop-arrival-time.sql` | Add `next_stop_arrival_time` column to `live_vehicles` |
| `docs/plans/05-vehicle-bottom-sheet.md` | This plan document |

### Modify

| File | Changes |
|------|---------|
| `backend/src/server/routes/v1/_entity/vehicle.rs` | Add `next_stop_arrival_time: Option<u64>` field; update `to_simple()` to append it at index 10 |
| `backend/src/server/routes/v1/mod.rs` | Extract `stu.arrival.time` alongside existing `delay`; include in DB insert; update SQL to include new column |
| `frontend/src/app/entity/v1/vehicle.ts` | Parse `nextStopId` (idx 7), `nextStopSequence` (idx 8), `nextStopArrivalDelay` (idx 9), `nextStopArrivalTime` (idx 10) from `fromSimple()` |
| `frontend/src/components/stop-card.tsx` → `frontend/src/components/bottom-sheet.tsx` | Rename file; rename component to `BottomSheet`; add vehicle detail mode with scrollable stop list |
| `frontend/src/app.tsx` | Update import from `StopCard` to `BottomSheet` |

### Delete

None.

## Database Schema

Add one column to `live_vehicles`:

```sql
ALTER TABLE live_vehicles ADD COLUMN next_stop_arrival_time INTEGER;
```

Nullable. `NULL` when no absolute arrival time is available from the feed.

## Vehicle Struct Changes (Backend)

New field:

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub next_stop_arrival_time: Option<u64>,
```

`to_simple()` output — new field at index 10:

| Index | Type | Field | Notes |
|-------|------|-------|-------|
| 0 | String | id | unchanged |
| 1 | String | route_id | unchanged |
| 2 | String | trip_id | unchanged |
| 3 | F32 | latitude | unchanged |
| 4 | F32 | longitude | unchanged |
| 5 | F32/Null | prev_latitude | unchanged |
| 6 | F32/Null | prev_longitude | unchanged |
| 7 | String/Null | next_stop_id | unchanged |
| 8 | U32/Null | next_stop_sequence | unchanged |
| 9 | I32/Null | next_stop_arrival_delay | unchanged |
| **10** | **U64/Null** | **next_stop_arrival_time** | Unix epoch seconds, `Null` if unavailable |

## TripUpdate Parsing (Backend)

Updated extraction in `process_feed()`:

```rust
struct NextStopInfo {
    stop_id: String,
    stop_sequence: u32,
    arrival_delay: Option<i32>,
    arrival_time: Option<u64>,  // NEW
}
```

Extraction:

```
for each FeedEntity with trip_update:
    tu = entity.trip_update
    if tu.stop_time_update is non-empty:
        stu = tu.stop_time_update[0]
        map[tu.trip.trip_id] = NextStopInfo {
            stop_id: stu.stop_id,
            stop_sequence: stu.stop_sequence,
            arrival_delay: stu.arrival.and_then(|a| a.delay),
            arrival_time: stu.arrival.and_then(|a| a.time),  // NEW
        }
```

## VehicleV1 Class Changes (Frontend)

New fields:

```ts
nextStopId: string | null;
nextStopSequence: number | null;
nextStopArrivalDelay: number | null;
nextStopArrivalTime: number | null;
```

Updated `fromSimple()`:

```ts
nextStopId: data[7] != null ? String(data[7]) : null,
nextStopSequence: data[8] != null ? Number(data[8]) : null,
nextStopArrivalDelay: data[9] != null ? Number(data[9]) : null,
nextStopArrivalTime: data[10] != null ? Number(data[10]) : null,
```

## BottomSheet Component (Frontend)

### Selection mode detection

```ts
const selectedVehicle = followingVehicleIdSignal.value
  ? vehiclesSignal.value.get(followingVehicleIdSignal.value) ?? null
  : null;
const selectedStop = selectedStopSignal.value;

if (selectedVehicle) → vehicle mode
else if (selectedStop) → stop mode
else → hidden
```

### Vehicle mode layout

```
┌─────────────────────────────────────────┐
│ [Route Badge] Route {routeId}       [✕] │
├─────────────────────────────────────────┤
│  · Črnomerec                      (dim) │  ← passed stop
│  · Kaptol                         (dim) │
│  ● Sopot                    3 min (bold)│  ← next stop, highlighted
│  · Kvaternikov trg                     │  ← upcoming stop
│  · Mihaljevac                          │
│  ...                                   │  ← scrollable
└─────────────────────────────────────────┘
```

### Arrival time computation

```ts
function formatArrival(vehicle: VehicleV1): string | null {
  if (vehicle.nextStopArrivalTime) {
    const secondsUntil = vehicle.nextStopArrivalTime - Date.now() / 1000;
    const minutes = Math.round(secondsUntil / 60);
    if (minutes <= 0) return "now";
    return `${minutes} min`;
  }
  if (vehicle.nextStopArrivalDelay != null) {
    if (vehicle.nextStopArrivalDelay === 0) return "on time";
    const minutes = Math.round(vehicle.nextStopArrivalDelay / 60);
    return minutes >= 0 ? `+${minutes} min` : `${minutes} min`;
  }
  return null;
}
```

### Stop list rendering

- Read `displayedStopsSignal` (already populated with ordered stops by `fetchFollowingRoute`)
- Find the next stop by matching `vehicle.nextStopId` against each stop's `ids` array
- Stops before the next stop: rendered with `text-gray-400` (passed)
- Next stop: rendered with bold text, accent background, and arrival time badge
- Stops after: rendered normally
- If `nextStopId` is null, no stop is highlighted

### Dismiss behavior

Already clears all signals:

```ts
followingVehicleIdSignal.value = null;
followingStopIdsSignal.value = [];
followingTripIdsSignal.value = null;
followingRouteSignal.value = null;
selectedStopSignal.value = null;
displayedStopsSignal.value = stopsGroupedSignal.value;
```

### Shared with stop mode

- Same bottom-sheet animation (slide up / fade in, 200ms ease-out)
- Same dismiss button and behavior
- Stop mode content is unchanged from current `StopCard`

## Implementation Order

1. Create DB migration (ALTER TABLE add `next_stop_arrival_time`)
2. Expand `Vehicle` struct + `to_simple()` (backend)
3. Update `process_feed()` to extract `arrival.time` + update DB writes (backend)
4. Update `VehicleV1.fromSimple()` to parse all next-stop fields (frontend)
5. Rename `stop-card.tsx` → `bottom-sheet.tsx` + rename component
6. Update `app.tsx` import
7. Implement vehicle mode in `BottomSheet` component
8. Run backend lint + fmt
9. Run frontend lint + format + build

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `StopTimeEvent.time` not provided by ZET feed | `Option<u64>` / nullable — falls back to delay-only display |
| Feed changes `stop_time_update` count | Take first element (same as existing plan 04 behavior) |
| Vehicle disappears from feed while selected | Card stays open; vehicle data remains in signal until dismissed |
| Long stop lists cause tall card | Max-height container with overflow scroll |
| Frontend Zod rejects longer tuple | Already uses `.rest(z.unknown())` — no change needed |
| `nextStopId` doesn't match any displayed stop | No stop highlighted; all shown as upcoming |
