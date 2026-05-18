# Code Review: Astro → Preact + Vite + Tailwind Rewrite

## Overview

Migration of the frontend from Astro to Preact + Vite + Tailwind CSS v4. The changeset spans 30+ files across configuration, components, hooks, state management, and build tooling.

---

## Critical Issues

### 1. Signal reads outside reactive contexts

**Files:** `map-container.tsx`, `status-bar.tsx`, `stop-card.tsx`

Multiple components read signal values directly at the top-level of their function body:

```tsx
// map-container.tsx:55-60
const vehicles = vehiclesSignal.value;
const followingVehicleId = followingVehicleIdSignal.value;
const followingTripIds = followingTripIdsSignal.value;
const deltaMoveLines = deltaMoveLinesSignal.value;
const displayedStops = displayedStopsSignal.value;
const followingRoute = followingRouteSignal.value;
```

In Preact Signals, reading `.value` outside of `useEffect`, `useSignalEffect`, or a reactive wrapper won't subscribe the component to changes. These values are captured once per render cycle. If nothing else triggers a re-render, the UI won't update when the signal changes.

This currently works because `batch()` writes in `processMessage` may coincidentally trigger re-renders through other mechanisms, but it's fragile and depends on implementation details of the signal runtime.

**Recommendation:** Use `useSignalTracker` from `@preact/signals`, wrap reads in `useComputed`, or use `effect()` to subscribe explicitly. Alternatively, consider that `react-map-gl` and other React-ecosystem libraries may bridge this correctly — but verify each signal read.

---

### 2. Worker leak in `useStops` fetch cycle

**File:** `use-stops.ts:22-36`

Every call to `fetchStops()` creates a new `Worker`:

```ts
const worker = new Worker(new URL("../scripts/worker.ts", import.meta.url), {
  type: "module",
});
worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
  // ...
  worker.terminate();
});
worker.postMessage({ type: "process-message", data: new Blob([x]) });
```

The worker is only terminated inside the `message` handler. If the worker throws an uncaught error or the message never arrives, the worker is never cleaned up. Since `fetchStops` runs on a ~60s interval, this can accumulate leaked workers over time.

Additionally, the main `useWebSocket` hook already sets up a persistent worker via `use-worker.ts`. The `fetchStops` function should reuse the same worker infrastructure instead of spawning ephemeral workers.

**Recommendation:** Either reuse the shared worker from `use-worker.ts`, or add an `error` handler that calls `worker.terminate()`. Better yet, refactor `processMessage` to be callable directly (it's already exported) and route the fetch response through the same worker pipeline used by the WebSocket.

---

### 3. WebSocket connections not cleaned up on unmount

**File:** `use-websocket.ts:69-86`

The `connectWebSocket` function creates a `WebSocket` scoped inside a closure:

```ts
async function connectWebSocket() {
  return new Promise<null>((resolve) => {
    const ws = new WebSocket(websocketUrl);
    // ...
  });
}
```

The cleanup function sets `cancelled = true` to stop the reconnect loop, but it has no reference to the active `ws` object. On component unmount or HMR, the WebSocket remains open as a zombie connection.

**Recommendation:** Store the active `ws` in a ref so the cleanup function can call `ws.close()`:

```ts
const wsRef = useRef<WebSocket | null>(null);

// In cleanup:
return () => {
  cancelled = true;
  wsRef.current?.close();
};
```

---

### 4. Race conditions in async fetch handlers

**Files:** `use-stops.ts:228-269` (`fetchFollowingRoute`, `fetchStopTrips`)

Rapid user interaction (clicking different stops or vehicles) can trigger overlapping fetches. Since these functions directly set signals, a slower older response can overwrite a newer one:

```ts
// User clicks stop A, then stop B quickly
// fetchStopTrips(A) resolves late and overwrites state set by fetchStopTrips(B)
```

**Recommendation:** Use an abort controller or a request ID / stale-check pattern:

```ts
let fetchId = 0;

export async function fetchStopTrips(stopIds: string[]) {
  const myId = ++fetchId;
  const trips = await fetch(/* ... */);
  if (myId !== fetchId) return; // stale
  // ... set signals
}
```

---

## Medium Priority Issues

### 5. `StatusBar` mixes `useState` with signal reads

**File:** `status-bar.tsx:13-26`

The component uses Preact `useState` for `expanded` and a `setTick` timer to force re-renders, while reading signals like `lastUpdateSignal.value` and `wsConnectedSignal.value` directly. This is inconsistent with the rest of the codebase which uses signals exclusively.

The `setTick` timer trick works but is wasteful — it re-renders the entire component every second even when nothing has changed.

**Recommendation:** Use signals for all state, and `useSignalEffect` to subscribe to the timer update:

```ts
const expanded = useSignal(false);
const tick = useSignal(0);

useSignalEffect(() => {
  const id = setInterval(() => { tick.value++; }, 1000);
  return () => clearInterval(id);
});
```

---

### 6. Duplicate import in `StopCard`

**File:** `stop-card.tsx:6-7`

```ts
import {
  followingTripIdsSignal,
  // ...
  followingTripIdsSignal as tripIdsSignal,
} from "@/state";
```

`followingTripIdsSignal` is imported twice — once under its own name and once aliased as `tripIdsSignal`. The alias is used only once (line 45: `tripIdsSignal.value = null`). This is confusing and unnecessary.

**Recommendation:** Use `followingTripIdsSignal` everywhere, remove the alias.

---

### 7. Fragile route color heuristic

**Files:** `vehicle-marker.tsx:31`, `stop-card.tsx:72`

```ts
// vehicle-marker.tsx
style={{ "--theme-color": vehicle.routeId.length > 2 ? "blue" : "red" }}

// stop-card.tsx
style={{ backgroundColor: route.length > 2 ? "#2563eb" : "#dc2626" }}
```

Using string length to distinguish tram (red) from bus (blue) routes is brittle. Route IDs are strings like `"1"`, `"31"`, `"116"`, `"209"`. A two-digit bus route like `"31"` would be colored red (tram) because its length is 2.

**Recommendation:** Use a numeric threshold (e.g., `parseInt(routeId, 10) >= 100`) or, ideally, carry a route type from the backend data. Note that `use-stops.ts:157` already does `Number(v.routeId) >= 100` for delta line colors, which is inconsistent with the marker logic.

---

### 8. `areaOf` uses degree-based bounding box for stop grouping

**File:** `use-stops.ts:50-56`

```ts
function areaOf(stops: StopV1[]) {
  // ...
  return (maxLat - minLat) * (maxLng - minLng);
}
```

The area is computed in degree², but at Zagreb's latitude (~45.8°N), 1° longitude ≈ 69km × cos(45.8°) ≈ 48km, while 1° latitude ≈ 111km. The threshold `1e-7` degree² doesn't represent a uniform physical distance. Two stops 50m apart east-west may not be grouped while two stops 50m apart north-south would be.

**Recommendation:** Use Haversine distance or at minimum correct for latitude. For a rough fix:

```ts
const latCorrection = Math.cos((avgLat * Math.PI) / 180);
return (maxLat - minLat) * (maxLng - minLng) * latCorrection;
```

---

### 9. Nested `requestIdleCallback` complicates stop grouping

**File:** `use-stops.ts:67-99`

`computeGroupedStops` uses two nested `requestIdleCallback` calls:

```ts
requestIdleCallback(() => {
  // first pass: group by name + proximity
  requestIdleCallback(() => {
    // second pass: flatten + compute averages
  });
});
```

This spreads a synchronous computation across two idle periods unnecessarily. The grouping isn't that expensive for Zagreb's ~2,000 stops — a single pass should be fast enough.

**Recommendation:** Merge into a single `requestIdleCallback` or compute synchronously. If profiling shows it's slow, use a single callback with chunked work.

---

### 10. `handleClick` in `MapContainer` is too large

**File:** `map-container.tsx:71-118`

The click handler is ~50 lines and handles: stop feature detection, JSON parsing of stop IDs, signal updates, stop name resolution, stop trips fetching, vehicle route matching, and route sorting. This is a "god callback."

**Recommendation:** Extract into smaller functions:

- `handleStopClick(stopFeature)` — stop selection logic
- `handleMapBackgroundClick()` — deselection logic

This also makes the logic testable in isolation.

---

### 11. Missing Plausible analytics integration

**Files:** `consts.ts`, `.github/workflows/deploy.yaml`

The `PLAUSIBLE_*` env vars and constants are defined and the CI was updated to pass them as `VITE_`-prefixed env vars, but no component renders the Plausible `<script>` tag. The old `BaseHead.astro` likely handled this, and the rewrite dropped it.

**Recommendation:** Add a `PlausibleScript` component or include it in `index.html`:

```tsx
// app.tsx or index.html
<script defer data-domain={PLAUSIBLE_SITE_URL} src={PLAUSIBLE_SCRIPT_URL} />
```

---

## Low Priority / Style

### 14. `3d.json` map style diff is all formatting

**File:** `data/maps/style/3d.json`

The diff shows ~800 lines changed but they're all collapsing multi-line JSON arrays onto single lines (e.g., `"line-width": [...]` expressions). The actual style logic is unchanged.

**Recommendation:** In the future, separate formatting changes from functional changes for cleaner git history and easier review.

---

### 15. `vite.config.ts` react alias lacks documentation

**File:** `vite.config.ts:25-29`

```ts
resolve: {
  alias: {
    react: "preact/compat",
    "react-dom": "preact/compat",
  },
},
```

This exists for `react-map-gl` compatibility but there's no comment explaining why. Future contributors may wonder why React is aliased in a Preact project.

**Recommendation:** Add a brief comment:

```ts
// react-map-gl imports from 'react' — alias to preact/compat for compatibility
```

---

### Recommended Priority Order

1. Fix signal reactivity (Critical #1) — audit every `.value` read
2. Fix WebSocket cleanup (Critical #3) — store `ws` in a ref
3. Fix worker leak in `fetchStops` (Critical #2) — reuse shared worker
4. Add race condition guards (Critical #4) — abort controller or stale check
5. Add Plausible script (Medium #11) — analytics gap
6. Fix route color heuristic (Medium #7) — incorrect visual classification
