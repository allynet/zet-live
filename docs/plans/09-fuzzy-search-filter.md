# Plan: Fuzzy Search & Filter for Stations and Vehicles

## Goal

Add a fuzzy search UI to the frontend that lets users search for stations (by name, e.g. "Olipska") or vehicles (by route ID e.g. "226" or route name e.g. "Svetice"). The search shows a dropdown with matching results AND filters the map to only show matching items. Searching is done entirely client-side since all data is already available via Preact signals.

Uses [fuse.js](https://fusejs.io/) for fuzzy string matching.

## Context

- All vehicle and stop data is available client-side via Preact signals:
  - `vehiclesSignal: Map<string, VehicleV1>` — live vehicles keyed by `vehicle-{id}`
  - `stopsGroupedSignal: GroupedStop[]` — stops grouped by name + proximity
- `VehicleV1` has `id`, `routeId`, `routeLongName`, `tripId`, `lat`, `lng` (and other fields)
- `GroupedStop` has `name`, `lat`, `lng`, `ids: string[]`
- No existing search or filter functionality exists in the frontend
- No external UI component library is used — all UI is built with Preact + Tailwind CSS v4
- The top-left area of the map has `StatusBar` (fixed `top-2 left-2`) and `MapStyleSwitcher` (absolute `top-14 left-2`)

## Design Decisions

- **fuse.js for fuzzy matching** — ~5KB gzipped, simple API, threshold-based matching. Rebuilding the index on every data change with ~500 items takes <1ms.
- **Two-component pattern** — `SearchBar` (outer) renders a collapsed icon button; `SearchBarExpanded` (inner) subscribes to data signals and renders the input + dropdown. When collapsed, no signal subscriptions exist — no unnecessary re-renders.
- **Signal-based map filtering** — `SearchBarExpanded` computes matched vehicle/stop ID sets and writes them to Preact signals. `MapContainer` reads these signals to filter GeoJSON sources. This avoids duplicating fuse.js computation.
- **Expandable button next to MapStyleSwitcher** — collapsed state is a search icon button in the top-left controls row. Expands to a `w-64` input with dropdown.
- **Vehicle results grouped by route** — multiple vehicles on the same route are shown as a single result ("Route 226 - Svetice (3 vehicles)"). Clicking selects the first matching vehicle.
- **Search and selection are independent** — search can be active while a vehicle/stop is selected. The map shows the intersection of both filters. Selecting a search result replaces the current selection and closes the search.
- **Delta-move-lines hidden during search** — movement vectors are not relevant when searching and would add visual noise.
- **Vehicle marker dimming disabled during search** — all matching vehicles shown at full opacity (no "following state" dimming).
- **Cleanup on close** — when search closes, matched ID signals are set to `null` (map shows everything again). Cleanup happens in the parent `SearchBar` (synchronous, before unmount) and in `SearchBarExpanded`'s unmount effect (safety net).

## File Operations

### Create

| File | Purpose |
|------|---------|
| `frontend/src/components/search-bar.tsx` | Expandable search component with fuse.js logic |
| `docs/plans/09-fuzzy-search-filter.md` | This plan document |

### Modify

| File | Changes |
|------|---------|
| `frontend/src/state.ts` | Add `searchMatchedVehicleMapIdsSignal` and `searchMatchedStopIdsSignal` |
| `frontend/src/components/map-container.tsx` | Filter vehicles/stops GeoJSON by search IDs; hide delta-move-lines during search; disable marker dimming during search; add `SearchBar` to controls wrapper |
| `frontend/src/components/map-style-switcher.tsx` | Remove `absolute top-14 left-2 z-1000` from outer div (positioned by wrapper) |

### Delete

None.

## New Dependency

```
bun add fuse.js    # fuse.js@7.x — fuzzy search library (~5KB gzipped)
```

## Search Logic

### Fuse.js Configuration

**Vehicle search** — searches `routeId` (weight 1.0) and `routeLongName` (weight 0.7):

```ts
new Fuse(vehicleArray, {
  keys: [
    { name: "routeId", weight: 1.0 },
    { name: "routeLongName", weight: 0.7 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
})
```

- `threshold: 0.4` — tighter matching for route IDs (exact or near-exact)
- `ignoreLocation: true` — allows matching "Svetice" anywhere in "Savski gaj - Svetice"

**Station search** — searches `name`:

```ts
new Fuse(stopsGrouped, {
  keys: ["name"],
  threshold: 0.5,
  ignoreLocation: true,
})
```

- `threshold: 0.5` — more lenient for fuzzy name matching (e.g. "Olipska" → "Boropska")

### Result Grouping

Vehicle results are grouped by `routeId + routeLongName`:

```ts
type VehicleRouteGroup = {
  routeId: string;
  routeLongName: string | null;
  vehicles: VehicleV1[];
};
```

Each group becomes one dropdown entry showing the route badge + name + vehicle count. Maximum 5 results per category (stations, vehicles).

### Map Filtering

Matched ID sets are written to signals:

```ts
searchMatchedVehicleMapIdsSignal.value = new Set(matchedVehicles.map(v => v.getMapId()));
searchMatchedStopIdsSignal.value = new Set(matchedStations.flatMap(s => s.ids));
```

`null` means no filter active (show everything).

## Search Component (`search-bar.tsx`)

### Component Structure

```
SearchBar (outer — always rendered)
├── Collapsed state: icon button
└── SearchBarExpanded (inner — only when expanded)
    ├── Input bar (search icon + text input + clear/close button)
    └── Results dropdown (stations section + vehicles section)
```

### SearchBar (outer)

- Manages `expanded` state
- `handleClose()` clears matched ID signals synchronously before setting `expanded = false`
- When collapsed, renders a single `<button>` — no signal subscriptions, no re-renders on data changes

### SearchBarExpanded (inner)

- Subscribes to `vehiclesSignal` and `stopsGroupedSignal` via `useSignalState`
- Computes fuse results via `useMemo` (depends on `query`, `vehicles`, `stopsGrouped`)
- Updates matched ID signals via `useEffect` on results change
- Clears matched IDs on unmount (safety net)

### Dropdown Layout

```
┌──────────────────────────────────┐
│ 🔍 Search stations or routes…  ✕ │  ← input bar (w-64)
├──────────────────────────────────┤
│ STATIONS                         │  ← section header
│  Boropska                        │  ← result (highlighted on focus)
│   3 stops                        │
│  Svetice                         │
│   1 stop                         │
├──────────────────────────────────┤
│ VEHICLES                         │
│  [226] Svetice - Borongaj        │  ← route badge + name
│   3 vehicles                     │
│  [11] Črnomerec - Borongaj       │
│   2 vehicles                     │
└──────────────────────────────────┘
```

### Interaction

| Action | Behavior |
|--------|----------|
| Click collapsed button | Expands search, focuses input |
| Type in input | Fuzzy search runs, map filters, dropdown updates |
| Click station result | `selectStop(ids)` + `flyToTargetSignal` + close search |
| Click vehicle result | `selectVehicle(first.id, first.tripId, true)` + close search |
| Arrow Down/Up | Navigate results (highlight) |
| Enter | Select focused result |
| Escape | Close search |
| Clear button (query non-empty) | Clear query, keep search open |
| Clear button (query empty) | Close search |
| Click outside | Close search |

### Keyboard Navigation

- `focusedIndex` state tracks highlighted result across both sections (stations first, then vehicles)
- `onMouseEnter` on result buttons also sets `focusedIndex` for hover + keyboard consistency

## Map Container Changes

### Controls Layout

Wrap `MapStyleSwitcher` and `SearchBar` in a flex container:

```jsx
<div class="absolute top-14 left-2 z-1000 flex items-start gap-1">
  <MapStyleSwitcher />
  <SearchBar />
</div>
```

`MapStyleSwitcher` loses its own `absolute` positioning and becomes a flex child.

### Vehicle GeoJSON Filtering

```ts
const searchMatchedVehicleIds = useSignalState(searchMatchedVehicleMapIdsSignal);

const vehiclesGeoJson = useMemo(() => {
  const all = Array.from(vehicles.values());
  const filtered = searchMatchedVehicleIds
    ? all.filter((v) => searchMatchedVehicleIds.has(v.getMapId()))
    : all;
  return { type: "FeatureCollection", features: filtered.map(...) };
}, [vehicles, followingVehicleId, followingTripIds, searchMatchedVehicleIds]);
```

### Stop GeoJSON Filtering

```ts
const searchMatchedStopIds = useSignalState(searchMatchedStopIdsSignal);

const routeStopsFeatures = useMemo(() => {
  const filtered = searchMatchedStopIds
    ? displayedStops.filter((s) => s.ids.some((id) => searchMatchedStopIds.has(id)))
    : displayedStops;
  return { type: "FeatureCollection", features: filtered.map(...) };
}, [displayedStops, nextStopId, searchMatchedStopIds]);
```

### Vehicle Marker Paint

During search, disable dimming of non-following vehicles:

```ts
const vehicleMarkerPaint = useMemo(() => {
  if (searchActive) return {} as const;
  return { "icon-opacity": ["case", ["==", ["get", "followingState"], 2], 0.1, 1] } as const;
}, [searchActive]);
```

### Delta Move Lines

Hidden during search:

```jsx
{!searchActive && (
  <Source id="delta-move-lines" type="geojson" data={deltaMoveFeatures}>
    ...
  </Source>
)}
```

## MapStyleSwitcher Changes

Remove `absolute top-14 left-2 z-1000` from outer `<div>`. The parent flex wrapper in `MapContainer` now handles positioning. The component keeps its internal logic (button, dropdown panel, click-outside handling) unchanged.

## State Signal Changes

Add two signals to `state.ts`:

```ts
export const searchMatchedVehicleMapIdsSignal = signal<Set<string> | null>(null);
export const searchMatchedStopIdsSignal = signal<Set<string> | null>(null);
```

- `null` = no search active, show everything
- `Set<string>` = only show items whose IDs are in the set (empty set = show nothing)

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty query | No results, no map filtering |
| Query matches nothing | "No results found" message; map shows nothing (all filtered out) |
| Search while vehicle selected | Both filters apply — map shows intersection of search + selection |
| Select search result | New selection replaces old; search closes; filter clears |
| Close search without selecting | Filter clears; any prior selection remains |
| Vehicle data updates while searching | `SearchBarExpanded` re-renders, fuse recomputes, results update live |
| Search opened while no data loaded | Fuse searches empty arrays — no results — acceptable |
| Click MapStyleSwitcher while search open | Search closes (click-outside handler), then style panel opens |
| Click map vehicle while search open | Search closes (click-outside handler), clicked vehicle selected |

## Implementation Order

1. `bun add fuse.js` in `frontend/`
2. Add signals to `frontend/src/state.ts`
3. Create `frontend/src/components/search-bar.tsx`
4. Modify `frontend/src/components/map-style-switcher.tsx` (remove absolute positioning)
5. Modify `frontend/src/components/map-container.tsx` (filtering + controls wrapper)
6. Run frontend lint + format + build

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Fuse index rebuild on every vehicle update (~seconds) | ~500 items, <1ms rebuild — acceptable |
| `SearchBarExpanded` re-renders on every vehicle update | Only when expanded; component is small; Preact diffing is fast |
| Both search + selection active simultaneously | Intersection of filters; search closes on result selection |
| Matched ID signals briefly non-null after close | Parent `handleClose()` clears synchronously before unmount |
| Fuse threshold too strict/lenient for typos | Station threshold 0.5, vehicle threshold 0.4 — tuned for use case |
| Route long names not matching substrings | `ignoreLocation: true` allows matching anywhere in the string |
| Dropdown overlaps with MapStyleSwitcher dropdown | Can't have both open — clicking one closes the other via click-outside |
| `noUncheckedIndexedAccess` on `group.vehicles[0]` | Null check: `if (first) { selectVehicle(...) }` |
