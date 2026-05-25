# Plan: URL Query Params for Frontend State

## Goal

Persist relevant frontend selection state (selected vehicle, selected stop, active trip) as URL query parameters so that users can share deep links and use browser back/forward navigation to revisit selections. The URL hash is already used by MapLibre for map position metadata, so query params are the only option.

URL updates must not disrupt the page (no reload), and each meaningful state change should create a browser history entry (for back/forward). Rapid consecutive changes are debounced (300ms) to avoid history spam.

## Context

- The app has no router. It is a single view with a full-screen map and overlay bottom sheets.
- The URL hash stores map position (`#zoom/lat/lng/bearing/pitch`) via react-map-gl's `hash` prop. This cannot be changed.
- All selection state is ephemeral Preact signals in `state.ts`. Key selection signals:
  - `followingVehicleIdSignal: string | null` — stores the vehicle map ID (`vehicle-{rawId}`)
  - `followingTripIdSignal: string | null` — the trip ID of the followed vehicle
  - `followingStopIdsSignal: string[]` — stop IDs for the selected stop group
- Derived signals (`selectedStopSignal`, `displayedStopsSignal`, `followingRouteSignal`, etc.) do not need separate URL params — they are recomputed from the primitives.
- Selection logic is duplicated across `app.tsx` (stop click, arrival click, dismiss) and `map-container.tsx` (vehicle click, map click). This needs to be consolidated.

## Design Decisions

- **Query params, not hash** — the hash is owned by MapLibre. Query params coexist cleanly: `?vehicle=1234&trip=abc#12/45.81/15.98/0/0`.
- **Raw vehicle ID in URL** — strip the `vehicle-` prefix for cleaner URLs (`?vehicle=1234` not `?vehicle=vehicle-1234`). The sync layer adds/strips the prefix.
- **Repeated `stop` param** — for multi-stop groups: `?stop=id1&stop=id2`.
- **Debounced `pushState`** (300ms) — rapid clicks (e.g. clicking different vehicles) use `replaceState` during the debounce window, then `pushState` once. This creates one history entry per "final" selection.
- **`popstate` restores state** — browser back/forward reads URL params and calls the selection actions.
- **Guard for missing data** — stop selection requires `simpleStopsSignal` to be populated. If data is not loaded yet on initial page load, we wait via `useSignalEffect`.
- **Mutual exclusivity** — vehicle and stop selection are mutually exclusive. If both `vehicle` and `stop` params are present in the URL, vehicle takes priority.
- **Extract `state-actions.ts`** — consolidate duplicated selection logic into shared functions that both the click handlers and URL sync can call.

## File Operations

### Create

| File | Purpose |
|------|---------|
| `frontend/src/state-actions.ts` | Shared selection action functions |
| `frontend/src/hooks/use-url-sync.ts` | URL ↔ signal bidirectional sync hook |
| `docs/plans/08-url-query-params.md` | This plan document |

### Modify

| File | Changes |
|------|---------|
| `frontend/src/app.tsx` | Import `useUrlSync`; refactor handlers to use `state-actions.ts` |
| `frontend/src/components/map-container.tsx` | Refactor click handlers to use `state-actions.ts` |

### Delete

None.

## URL Param Format

| Param | Example | Source signal | Notes |
|-------|---------|---------------|-------|
| `vehicle` | `?vehicle=1234` | `followingVehicleIdSignal` | Raw ID, prefix stripped |
| `trip` | `?trip=abc-123` | `followingTripIdSignal` | Needed to fetch route polyline |
| `stop` | `?stop=id1&stop=id2` | `followingStopIdsSignal` | Repeated param |

### Example URLs

- Vehicle selected: `https://example.com/?vehicle=1234&trip=abc#12/45.81/15.98/0/0`
- Stop selected: `https://example.com/?stop=stop-42&stop=stop-43#12/45.81/15.98/0/0`
- Nothing selected: `https://example.com/#12/45.81/15.98/0/0`

## State Actions (`state-actions.ts`)

Extract the duplicated selection logic from `app.tsx` and `map-container.tsx` into three shared functions:

### `selectVehicle(rawVehicleId: string, tripId: string, flyTo?: boolean)`

Clears stop state, sets vehicle signals, fetches route. If `flyTo` is true (triggered from stop sheet arrival click), also sets `flyToTargetSignal`.

```ts
export function selectVehicle(rawVehicleId: string, tripId: string, flyTo = false) {
  // Clear stop state
  followingStopIdsSignal.value = [];
  selectedStopSignal.value = null;
  stopArrivalTimesSignal.value = null;
  followingTripIdsSignal.value = null;

  // Set vehicle state
  const mapId = `vehicle-${rawVehicleId}`;
  followingVehicleIdSignal.value = mapId;
  followingTripIdSignal.value = tripId;

  if (flyTo) {
    const vehicle = vehiclesSignal.value.get(mapId);
    if (vehicle) {
      flyToTargetSignal.value = { longitude: vehicle.lng, latitude: vehicle.lat };
    }
  }

  if (tripId) {
    void fetchFollowingRoute(tripId);
  }
}
```

### `selectStop(stopIds: string[])`

Clears vehicle state, builds `selectedStopSignal` and `displayedStopsSignal` from `simpleStopsSignal`, fetches stop trips and arrival times.

```ts
export function selectStop(stopIds: string[]) {
  // Clear vehicle state
  followingVehicleIdSignal.value = null;
  followingTripIdSignal.value = null;
  followingRouteSignal.value = null;
  tripStopTimesSignal.value = null;

  // Set stop state
  followingStopIdsSignal.value = stopIds;

  const simpleStops = simpleStopsSignal.value;
  const stopName = stopIds.map((id) => simpleStops[id]?.name).find(Boolean) ?? "Unknown stop";

  selectedStopSignal.value = { name: stopName, ids: stopIds, routes: [] };

  const stops = stopIds
    .map((id) => simpleStops[id])
    .filter(Boolean)
    .map((stop) => ({ name: stop.name, lat: stop.lat, lng: stop.lng, ids: [stop.id] }));
  displayedStopsSignal.value = stops;

  void fetchStopTrips(stopIds).then((tripIds) => {
    if (!tripIds) return;
    followingTripIdsSignal.value = new Set(tripIds);

    const vehicles = vehiclesSignal.value;
    const routes = new Set<string>();
    for (const v of vehicles.values()) {
      if (tripIds.includes(v.tripId)) {
        routes.add(v.routeId);
      }
    }
    const sorted = Array.from(routes).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    selectedStopSignal.value = { name: stopName, ids: stopIds, routes: sorted };
  });

  void fetchStopArrivalTimes(stopIds);
}
```

### `clearSelection()`

Resets all selection signals to their defaults.

```ts
export function clearSelection() {
  followingVehicleIdSignal.value = null;
  followingStopIdsSignal.value = [];
  followingTripIdSignal.value = null;
  followingTripIdsSignal.value = null;
  followingRouteSignal.value = null;
  selectedStopSignal.value = null;
  displayedStopsSignal.value = stopsGroupedSignal.value;
  tripStopTimesSignal.value = null;
  stopArrivalTimesSignal.value = null;
}
```

## URL Sync Hook (`use-url-sync.ts`)

### Signal → URL

Uses `useSignalEffect` to watch the three key signals. Debounces with `setTimeout` (300ms): during the debounce window, uses `history.replaceState` to keep the URL current without creating entries. When the debounce fires, uses `history.pushState` to create one history entry.

A `isRestoringRef` flag prevents re-pushing when the signal change originated from a `popstate` event or initial load.

```ts
const DEBOUNCE_MS = 300;

export function useUrlSync() {
  const isRestoringRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  // Signal → URL
  useSignalEffect(() => {
    // Read signals to track them
    const vehicleMapId = followingVehicleIdSignal.value;
    const tripId = followingTripIdSignal.value;
    const stopIds = followingStopIdsSignal.value;

    if (isRestoringRef.current) return;

    const params = new URLSearchParams();
    if (vehicleMapId) {
      const rawId = vehicleMapId.replace(/^vehicle-/, "");
      params.set("vehicle", rawId);
      if (tripId) params.set("trip", tripId);
    } else if (stopIds.length > 0) {
      for (const id of stopIds) params.append("stop", id);
    }

    const newSearch = params.toString();
    const targetPath = newSearch ? `?${newSearch}` : "";

    // Debounce: replaceState during window, pushState at end
    if (debounceRef.current != null) {
      clearTimeout(debounceRef.current);
      history.replaceState(null, "", targetPath + location.hash);
    }

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      history.pushState(null, "", targetPath + location.hash);
    }, DEBOUNCE_MS);
  });

  // Cleanup on unmount
  useEffect(() => () => {
    if (debounceRef.current != null) clearTimeout(debounceRef.current);
  }, []);

  // ... popstate and initial load handlers below
}
```

### URL → Signal (popstate)

Listens for `popstate` events (browser back/forward). Reads URL params and calls `selectVehicle` or `selectStop`.

```ts
const handlePopState = useCallback(() => {
  isRestoringRef.current = true;

  const params = new URLSearchParams(location.search);
  const vehicleParam = params.get("vehicle");
  const tripParam = params.get("trip");
  const stopParams = params.getAll("stop");

  if (vehicleParam) {
    selectVehicle(vehicleParam, tripParam ?? "");
  } else if (stopParams.length > 0) {
    selectStop(stopParams);
  } else {
    clearSelection();
  }

  isRestoringRef.current = false;
}, []);

useEffect(() => {
  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}, [handlePopState]);
```

### Initial Load

On mount, reads URL params and applies selection. For vehicle selection, data fetches proceed immediately. For stop selection, must wait until `simpleStopsSignal` is populated (stops are fetched asynchronously).

```ts
const initializedRef = useRef(false);

useEffect(() => {
  if (initializedRef.current) return;
  initializedRef.current = true;

  const params = new URLSearchParams(location.search);
  const vehicleParam = params.get("vehicle");
  const tripParam = params.get("trip");
  const stopParams = params.getAll("stop");

  if (vehicleParam) {
    isRestoringRef.current = true;
    selectVehicle(vehicleParam, tripParam ?? "");
    isRestoringRef.current = false;
  } else if (stopParams.length > 0) {
    // Wait for stop data to load, then select
    const dispose = useSignalEffect(() => {
      if (Object.keys(simpleStopsSignal.value).length === 0) return;
      isRestoringRef.current = true;
      selectStop(stopParams);
      isRestoringRef.current = false;
      dispose();
    });
  }
}, []);
```

## Component Refactoring

### `app.tsx`

- Add `useUrlSync()` call (after `useWebSocket()` and `useStops()`)
- Replace `dismiss()` with `clearSelection()`
- Replace `handleStopClick` with `selectStop`
- Replace `handleArrivalClick` with `selectVehicle(..., true)` (flyTo = true)
- Remove duplicated signal imports that are now only used in `state-actions.ts`

### `map-container.tsx`

- Replace `handleVehicleClick` with `selectVehicle`
- Replace stop-click part of `handleClick` with `selectStop`
- Replace empty-map-click part of `handleClick` with `clearSelection`
- Remove duplicated imports

## Edge Cases

| Case | Behavior |
|------|----------|
| Both `vehicle` and `stop` params in URL | Vehicle takes priority; stop params ignored |
| Invalid vehicle ID | No crash — `vehiclesSignal.get()` returns `undefined`, `selectedVehicle` is `null`, bottom sheet shows empty |
| Invalid stop IDs | `simpleStops[id]` returns `undefined`, name falls back to "Unknown stop" |
| Stop params but stop data not yet loaded | `useSignalEffect` waits for `simpleStopsSignal` to be non-empty, then calls `selectStop` |
| Rapid vehicle clicks | Debounced: intermediate clicks use `replaceState`, final uses `pushState` |
| Browser back from vehicle to no selection | `popstate` reads empty params, calls `clearSelection()` |
| Browser back from vehicle to stop | `popstate` reads stop params, calls `selectStop()` |
| Map hash changes (zoom/pan) | Unaffected — hash is separate from query params |
| Page unload during debounce | `pushState` never fires, but `replaceState` already updated URL — acceptable |
| Navigating to URL with no params | Normal app load, no selection |

## Implementation Order

1. Create `frontend/src/state-actions.ts` with `selectVehicle`, `selectStop`, `clearSelection`
2. Create `frontend/src/hooks/use-url-sync.ts`
3. Refactor `frontend/src/app.tsx` — use state-actions + add `useUrlSync()`
4. Refactor `frontend/src/components/map-container.tsx` — use state-actions
5. Run frontend lint + format + build

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Infinite loop: signal → URL → popstate → signal | `isRestoringRef` flag prevents URL push during restore |
| `selectStop` called before stops loaded (initial load) | Guard with `useSignalEffect` waiting for non-empty `simpleStopsSignal` |
| Map hash conflicts with query params | No conflict — hash and search are separate parts of the URL |
| Stale trip ID in URL after vehicle changes trip | Acceptable — `fetchFollowingRoute` will fetch whatever trip is in the URL |
| Debounce timer leaks on unmount | Cleanup effect clears timeout |
| `useSignalEffect` cleanup for stop-data guard | `dispose()` call removes the effect after one execution |
