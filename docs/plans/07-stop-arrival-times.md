# Plan: Stop Arrival Times

## Goal

When a stop is selected, show predicted arrival times for all active vehicles whose current trip includes that stop. Arrivals are grouped by route, sorted by earliest arrival, displaying like:

```
Sopot                                      [✕]
[233] (3 min) (12 min)
[109] (5 min) (28 min)
[6]   (1 min)
```

## Context

- Clicking a stop already populates `followingTripIdsSignal` with trip IDs that pass through it (via `fetchStopTrips`).
- `vehiclesSignal` has all live vehicles with `tripId`, `routeId`, `nextStopId`, `nextStopArrivalTime` — but only for the *next* stop, not an arbitrary stop on the route.
- The `live_trip_stop_times` table (plan 06) stores real-time StopTimeUpdate data per trip per stop sequence.
- The `gtfs_stop_times` table has scheduled `arrival_time` strings (`"HH:MM:SS"`) for every stop on every trip.
- The `parse_gtfs_time_to_unix` helper and schedule-fallback logic already exist in `schedule/mod.rs` (from plan 06).
- Only vehicles whose **current trip** includes the selected stop should be shown (not all vehicles on the route).

## Design Decisions

- **New backend endpoint** `GET /api/v1/schedule/stop-arrival-times?stop=id1&stop=id2` — single request returns all arrival predictions for the requested stops. No N+1 API calls.
- **Grouping is frontend-only** — the response is a flat array of `StopArrivalTime` objects. The frontend groups by `routeId` and sorts.
- **Same fallback logic as `get_trip_stop_times`** — real-time `arrival.time` preferred, then scheduled time + reference delay, then scheduled time only.
- **Reference delay is per-trip** — the delay from the nearest real-time StopTimeUpdate (lowest `stop_sequence` with both `arrival_time` and `arrival_delay`) is applied to all stops on that trip without real-time data.
- **Sorted output** — routes sorted by earliest arrival time in group; times within a group sorted by arrival time; entries with no prediction shown last.

## File Operations

### Modify

| File | Changes |
|------|---------|
| `backend/src/server/routes/v1/schedule/mod.rs` | New `get_stop_arrival_times` handler |
| `backend/src/server/routes/v1/mod.rs` | Register new route |
| `frontend/src/state.ts` | New `StopArrivalTime` type + `stopArrivalTimesSignal` |
| `frontend/src/hooks/use-stops.ts` | New `fetchStopArrivalTimes()` function |
| `frontend/src/components/map-container.tsx` | Call `fetchStopArrivalTimes` on stop click |
| `frontend/src/components/stop-sheet.tsx` | Show grouped route arrivals with time badges |
| `frontend/src/app.tsx` | Pass arrivals to StopSheet; clear signal on dismiss |

### Delete

None.

## Backend: New Endpoint

`GET /api/v1/schedule/stop-arrival-times?stop=id1&stop=id2`

Reuses the `GetStopTripsQuery` struct (field `stop: Vec<String>`).

### Response type

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopArrivalTime {
    trip_id: String,
    vehicle_id: String,
    route_id: String,
    stop_id: String,
    arrival_time: Option<i64>,
}
```

### Query logic

Three concurrent queries, then merge in Rust:

**Query 1: Matching vehicles** — live vehicles whose current trip passes through the requested stops:

```sql
SELECT DISTINCT lv.trip_id, lv.vehicle_id, lv.route_id, gst.stop_id, gst.stop_sequence
FROM live_vehicles lv
JOIN gtfs_stop_times gst ON gst.trip_id = lv.trip_id
WHERE gst.stop_id IN (?)
```

Gives one row per (vehicle, stop) pair. A single vehicle may appear multiple times if multiple requested stop_ids are on its trip (e.g. grouped stops).

**Query 2: Real-time data** for the matching trips:

```sql
SELECT trip_id, stop_sequence, arrival_time, arrival_delay
FROM live_trip_stop_times
WHERE trip_id IN (?)
```

**Query 3: Scheduled times** for the matching trip-stop pairs:

```sql
SELECT trip_id, stop_id, stop_sequence, arrival_time
FROM gtfs_stop_times
WHERE trip_id IN (?) AND stop_id IN (?)
ORDER BY stop_sequence
```

### Merge logic

1. Build `live_by_key: HashMap<(String, u32), &LiveStopTime>` — keyed by `(trip_id, stop_sequence)`.
2. Compute `reference_delay: HashMap<String, Option<i32>>` — per trip, the delay from the lowest-sequence real-time STU that has both `arrival_time` and `arrival_delay`.
3. Build `scheduled_by_key: HashMap<(String, String), &ScheduledStopTime>` — keyed by `(trip_id, stop_id)`.
4. For each row from Query 1:
   - Look up real-time data in `live_by_key` by `(trip_id, stop_sequence)`.
   - If real-time `arrival_time` exists → use it.
   - If real-time `arrival_delay` exists but no `arrival_time` → `scheduled_time + delay`.
   - If no real-time data → `scheduled_time + reference_delay`.
   - If nothing available → `None`.
5. Deduplicate by `vehicle_id` (keep earliest `arrival_time` if a vehicle matches multiple stop IDs).
6. Return sorted by `arrival_time` (nulls last).

### Deduplication

Multiple requested stop IDs (grouped stops) may match the same vehicle. Deduplicate by `vehicle_id`, keeping the entry with the earliest `arrival_time`.

## Frontend: State

`state.ts`:

```ts
export type StopArrivalTime = {
  tripId: string;
  vehicleId: string;
  routeId: string;
  stopId: string;
  arrivalTime: number | null;
};

export const stopArrivalTimesSignal = signal<StopArrivalTime[] | null>(null);
```

## Frontend: Fetch Function

`use-stops.ts`:

```ts
let stopArrivalTimesAbort: AbortController | null = null;

export async function fetchStopArrivalTimes(stopIds: string[]) {
  stopArrivalTimesAbort?.abort();
  stopArrivalTimesAbort = new AbortController();
  const { signal } = stopArrivalTimesAbort;

  const queryParams = new URLSearchParams();
  for (const stopId of stopIds) {
    queryParams.append("stop", stopId);
  }

  const res = await fetch(`${API_URL}/v1/schedule/stop-arrival-times?${queryParams}`, { signal })
    .then((x) => x.json())
    .catch(() => null);

  if (signal.aborted) return;

  stopArrivalTimesSignal.value = res?.d ?? null;
}
```

## Frontend: Stop Click Handler

`map-container.tsx` — in the stop click handler, add `fetchStopArrivalTimes(stopIds)` alongside existing `fetchStopTrips(stopIds)`:

```ts
void fetchStopTrips(stopIds).then((tripIds) => { ... });
void fetchStopArrivalTimes(stopIds);
```

Both fetches run concurrently. `fetchStopArrivalTimes` sets `stopArrivalTimesSignal` independently.

## Frontend: StopSheet Component

`stop-sheet.tsx` — complete rewrite of the content area.

Props:
```ts
type Props = {
  stop: { name: string; ids: string[]; routes: string[] };
  arrivals: StopArrivalTime[] | null;
  onDismiss: () => void;
};
```

### Grouping and sorting

```ts
const grouped = new Map<string, StopArrivalTime[]>();
for (const a of (arrivals ?? [])) {
  const list = grouped.get(a.routeId) ?? [];
  list.push(a);
  grouped.set(a.routeId, list);
}

// Sort each group's arrivals by arrivalTime (nulls last)
for (const [, list] of grouped) {
  list.sort((a, b) => {
    if (a.arrivalTime == null && b.arrivalTime == null) return 0;
    if (a.arrivalTime == null) return 1;
    if (b.arrivalTime == null) return -1;
    return a.arrivalTime - b.arrivalTime;
  });
}

// Sort groups by earliest arrival in group
const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => {
  const aMin = a.find((x) => x.arrivalTime != null)?.arrivalTime ?? Infinity;
  const bMin = b.find((x) => x.arrivalTime != null)?.arrivalTime ?? Infinity;
  return aMin - bMin;
});
```

### Layout

```
┌──────────────────────────────────────────────┐
│ Sopot                                      [✕] │
├──────────────────────────────────────────────┤
│ [6]   (1 min)                                │
│ [233] (3 min) (12 min)                       │
│ [109] (5 min) (28 min)                       │
└──────────────────────────────────────────────┘
```

Each row: route badge (red if length ≤ 2, blue otherwise) + time badges for each arrival.

Time formatting: `"now"` if ≤ 0 minutes, `"1 min"`, `"X min"`. Extract `formatMinutesFromNow` to a shared util or duplicate inline (it's small).

### Loading / empty states

- `arrivals === null` → show "Loading..." text
- `arrivals !== null && arrivals.length === 0` → show "No active vehicles" text

## Frontend: App Component

`app.tsx`:

- Import `stopArrivalTimesSignal`
- Read with `useSignalState`
- Pass to `StopSheet`: `<StopSheet stop={selectedStop} arrivals={stopArrivalTimes} onDismiss={dismiss} />`
- Remove `activeVehicles` prop (no longer needed; arrival count is visible in the list)
- Clear `stopArrivalTimesSignal.value = null` in `dismiss()`

## Edge Cases

| Case | Behavior |
|------|----------|
| No vehicles heading to this stop | Show "No active vehicles" |
| Vehicle's trip passes this stop but no arrival prediction | Route badge shown, no time badge |
| Multiple vehicles on same route | Grouped: `[233] (3 min) (12 min)` |
| Stop has multiple stop IDs (grouped stop) | All queried; deduplicated by vehicle_id in backend |
| Stop deselected while request in flight | AbortController cancels; signal cleared by dismiss |
| Real-time feed has partial data | Schedule + reference delay fallback applied per trip |
| Night routes (times > 24:00:00) | `parse_gtfs_time_to_unix` handles hours > 24 |

## Implementation Order

1. Backend: add `get_stop_arrival_times` endpoint in `schedule/mod.rs`
2. Backend: register route in `mod.rs`
3. Frontend: add `StopArrivalTime` type and `stopArrivalTimesSignal` to `state.ts`
4. Frontend: add `fetchStopArrivalTimes()` to `use-stops.ts`
5. Frontend: call `fetchStopArrivalTimes` in stop click handler (`map-container.tsx`)
6. Frontend: rewrite `stop-sheet.tsx` with grouped arrivals
7. Frontend: update `app.tsx` (pass arrivals, clear signal)
8. Run backend fmt + clippy
9. Run frontend lint + format + build

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Many trips pass through a popular stop (e.g. main station) | Query uses indexed columns; result set is limited to active (live) vehicles only |
| Concurrent queries slow for many stop IDs | Indexed queries on `gtfs_stop_times(stop_id, trip_id)` and `live_trip_stop_times(trip_id)` |
| `activeVehicles` prop removed from StopSheet | App.tsx updated to remove it; count is implicit in arrival list |
| Frontend shows stale data after vehicle updates | Signal re-fetched on each stop click; could add periodic re-fetch later |
| Backend returns duplicate entries for grouped stops | Deduplicated by `vehicle_id` in handler |
