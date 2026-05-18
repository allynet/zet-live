# Plan: Rewrite Frontend as Preact + Vite + Tailwind

## Goal

Replace the Astro-based frontend with a Preact SPA using Vite as the build tool, Tailwind CSS v4 for styling, and `react-map-gl` (via `preact/compat`) for declarative MapLibre GL map components. Use `@preact/signals` for reactive state management. Include `vite-tsconfig-paths` for path aliases.

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | latest | Build tool + dev server |
| Preact | 10.x | UI framework |
| `@preact/signals` | latest | Reactive state management |
| `react-map-gl` | 7.x+ | Declarative MapLibre GL wrapper (via `preact/compat`) |
| Tailwind CSS | 4.x | Utility-first CSS (`@tailwindcss/vite` plugin) |
| `vite-tsconfig-paths` | latest | Resolve `@/` path aliases from tsconfig |
| Bun | 1.x | Package manager (matching existing project) |
| `maplibre-gl` | 5.x | Map rendering engine |
| `cbor2` | 1.x | CBOR decoding in web worker |
| `zod` | 3.x | Runtime data validation |

## File Operations

### Delete

| File/Dir | Reason |
|----------|--------|
| `frontend/astro.config.mjs` | Astro config, replaced by `vite.config.ts` |
| `frontend/src/pages/index.astro` | Astro page, replaced by `index.html` + Preact components |
| `frontend/src/components/BaseHead.astro` | Astro component, SEO tags moved to `index.html` |
| `frontend/.astro/` | Astro build artifacts |
| `frontend/.vscode/extensions.json` | Astro extension recommendation |
| `frontend/.vscode/launch.json` | Astro dev server launch config |

### Create

| File | Purpose |
|------|---------|
| `frontend/index.html` | Vite entry HTML with full SEO meta tags, favicons, Plausible analytics, font/CSS preloads |
| `frontend/vite.config.ts` | Vite config: Preact plugin, `vite-tsconfig-paths`, Tailwind vite plugin, `__DATE__` define, rollup `_static/` output naming, `react` → `preact/compat` aliases |
| `frontend/src/vite-env.d.ts` | Vite client type declarations + `__DATE__` global |
| `frontend/src/main.tsx` | Entry point: imports CSS, renders `<App />` into `#app` |
| `frontend/src/app.css` | Tailwind v4 entry (`@import "tailwindcss"`) + custom vehicle marker styles (ported from inline `<style>` in `index.astro`) |
| `frontend/src/app.tsx` | Root `<App>` component, wires up WebSocket + stops + map |
| `frontend/src/state.ts` | Preact signals for: vehicles, stops, followingMarker, activeStopIds, bounds, stopsGrouped |
| `frontend/src/components/map-container.tsx` | Main map component wrapping `react-map-gl` `<Map>` |
| `frontend/src/components/vehicle-markers.tsx` | Iterates vehicle signals → renders `react-map-gl` `<Marker>` per vehicle |
| `frontend/src/components/vehicle-marker.tsx` | Single vehicle marker element (route badge, direction arrow) |
| `frontend/src/components/delta-move-layer.tsx` | GeoJSON source + line/symbol layers for delta move visualization |
| `frontend/src/components/route-stops-layer.tsx` | GeoJSON source + symbol layer for route stop labels |
| `frontend/src/components/following-route-layer.tsx` | GeoJSON source + line layer for currently-followed vehicle route |
| `frontend/src/hooks/use-websocket.ts` | WebSocket connection, reconnection loop, message dispatch to worker |
| `frontend/src/hooks/use-stops.ts` | Periodic stop fetching, grouping computation, bounds updates |
| `frontend/src/hooks/use-worker.ts` | Web Worker lifecycle + message handling |

### Modify

| File | Changes |
|------|---------|
| `frontend/package.json` | Replace Astro deps with Preact/Vite/Tailwind. Update scripts to `vite dev`/`vite build`/`vite preview` |
| `frontend/tsconfig.json` | Standard Vite+Preact tsconfig, path alias `@/*` → `src/*`, include `vite-env.d.ts` |
| `frontend/src/app/consts.ts` | Replace `astro:env/client` imports with `import.meta.env.VITE_*` |
| `frontend/src/app/entity/v1/vehicle.ts` | Remove direct `MaplibreglMarker` usage; marker lifecycle now managed by Preact components via `react-map-gl` |
| `frontend/src/app/entity/v1/stop.ts` | Same as vehicle — remove direct marker usage |
| `frontend/src/scripts/worker.ts` | No functional changes (already framework-agnostic) |
| `frontend/.env` | Prefix vars with `VITE_` for Vite convention |
| `frontend/.gitignore` | Remove `.astro/` entry |
| `.dockerignore` | Remove `/frontend/.astro` line |
| `.github/workflows/deploy.yaml` | Update env var names to `VITE_*` prefix |

### Keep Unchanged

| File/Dir | Reason |
|----------|--------|
| `frontend/public/*` | Static assets served as-is by Vite |
| `frontend/src/data/maps/style/flat.json` | MapLibre style definition |
| `frontend/src/data/maps/style/3d.json` | MapLibre style definition |
| `frontend/src/app/entity/versioned.ts` | Framework-agnostic Zod schema helper |
| `frontend/src/app/entity/v1/message.ts` | Framework-agnostic Zod schema |
| `frontend/src/scripts/worker.ts` | Framework-agnostic web worker |
| `Dockerfile` | Already runs `bun run build` and copies `dist/` — no changes needed |
| `.editorconfig` | Formatting rules still apply |

## Environment Variable Migration

| Old (Astro `envField`) | New (Vite `import.meta.env`) |
|---|---|
| `API_URL` | `VITE_API_URL` |
| `PUBLIC_SITE_URL` | `VITE_PUBLIC_SITE_URL` |
| `PLAUSIBLE_SITE_URL` | `VITE_PLAUSIBLE_SITE_URL` |
| `PLAUSIBLE_SCRIPT_URL` | `VITE_PLAUSIBLE_SCRIPT_URL` |
| `PLAUSIBLE_API_URL` | `VITE_PLAUSIBLE_API_URL` |

Defaults: `VITE_API_URL` defaults to `/api` (same as current Astro config).

## Component Architecture

```
index.html
  └── <script type="module" src="/src/main.tsx">
       └── main.tsx
            ├── import 'maplibre-gl/dist/maplibre-gl.css'
            ├── import './app.css'
            └── render(<App />, document.getElementById('app')!)
                 └── <App>  (src/app.tsx)
                      ├── useWorker() — initializes web worker
                      ├── useWebSocket() — connects, reconnects, sends blobs to worker
                      ├── useStops() — fetches stops periodically, computes groups
                      │
                      └── <MapContainer>  (src/components/map-container.tsx)
                           │  react-map-gl <Map> wrapper
                           │  - NavigationControl
                           │  - GeolocateControl
                           │  - Click handlers for stops/canvas
                           │  - Rotation handler for --bearing CSS var
                           │
                           ├── <VehicleMarkers>
                           │    └── For each vehicle in signal:
                           │         └── <Marker longitude={} latitude={}>
                           │              └── <VehicleMarker vehicle={...} />
                           │                   - Route badge
                           │                   - Direction arrow (CSS --move-angle)
                           │                   - Click → setFollowingMarker()
                           │
                           ├── <DeltaMoveLayer>
                           │    ├── <Source type="geojson" data={...}>
                           │    ├── <Layer type="line" ... />
                           │    └── <Layer type="symbol" icon="arrow-head" ... />
                           │
                           ├── <RouteStopsLayer>
                           │    └── <Source type="geojson" data={...}>
                           │         └── <Layer type="symbol" text-field={...} ... />
                           │
                           └── <FollowingRouteLayer>
                                ├── <Source type="geojson" data={...}>
                                ├── <Layer type="line" ... />
                                └── <Layer type="symbol" icon="arrow-head" ... />
```

## State Management (Preact Signals)

```typescript
// src/state.ts

// Vehicles
export const vehiclesSignal = signal<Map<string, VehicleV1>>(new Map());
export const vehicleBoundsSignal = signal<[[number, number], [number, number]]>(...);

// Stops
export const simpleStopsSignal = signal<Record<string, StopV1>>({});
export const stopsGroupedSignal = signal<GroupedStop[]>([]);
export const activeStopIdsSignal = signal<Set<string>>(new Set());
export const stopBoundsSignal = signal<[[number, number], [number, number]]>(...);

// Following
export const followingMarkerIdSignal = signal<string | null>(null);
export const followingStopIdsSignal = signal<string[]>([]);
export const followingTripIdSignal = signal<string | null>(null);
export const followingRouteSignal = signal<GeoJSON.FeatureCollection | null>(null);
```

## VehicleV1 / StopV1 Entity Changes

The current entities manage their own `MaplibreglMarker` instances. In the Preact rewrite, marker lifecycle is managed by React components (`<Marker>` from `react-map-gl`). Changes:

### `VehicleV1`
- **Remove**: `mapEntity` property, `setMapEntity()`, `updateMapEntity()` methods
- **Remove**: `MaplibreglMarker` import
- **Keep**: `id`, `routeId`, `tripId`, `lat`, `lng`, `moveAngle` properties
- **Keep**: `fromSimple()`, `toJSON()`, `getMapId()` methods
- **Change**: `moveAngle` computation moves to state update logic (compare previous lat/lng from a `Map` cache)

### `StopV1`
- **Remove**: `mapEntity` property, `setMapEntity()`, `updateMapEntity()`, `distanceFrom()` methods
- **Remove**: `MaplibreglMarker` import
- **Keep**: `id`, `name`, `lat`, `lng` properties
- **Keep**: `fromSimple()`, `toJSON()`, `getMapId()` methods

## Build Output Configuration

Vite will be configured to produce the same output structure as the Astro build:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        assetFileNames: '_static/file.[hash].[ext]',
        chunkFileNames: '_static/chunk.[hash].js',
        entryFileNames: '_static/entry.[hash].js',
      },
    },
  },
});
```

This ensures the Dockerfile and Rust backend (which embeds `dist/`) continue to work unchanged.

## Implementation Order

1. **Delete Astro files**: Remove `astro.config.mjs`, `src/pages/`, `src/components/BaseHead.astro`, `.astro/`, `.vscode/`
2. **Create build config**: `vite.config.ts`, updated `tsconfig.json`, `vite-env.d.ts`
3. **Update `package.json`**: Swap dependencies, update scripts
4. **Install deps**: `bun install`
5. **Create `index.html`**: Port SEO meta tags from `BaseHead.astro`
6. **Create `app.css`**: Tailwind entry + vehicle marker styles
7. **Update `consts.ts`**: `import.meta.env` instead of `astro:env`
8. **Create `state.ts`**: All Preact signals
9. **Update entity classes**: Remove marker management from `VehicleV1` and `StopV1`
10. **Create `hooks/`**: `use-websocket.ts`, `use-stops.ts`, `use-worker.ts`
11. **Create map components**: `map-container.tsx`, `vehicle-markers.tsx`, `vehicle-marker.tsx`, layer components
12. **Create `app.tsx`** and **`main.tsx`**: Wire everything together
13. **Update env files**: `.env` with `VITE_` prefix
14. **Update `.gitignore`**: Remove `.astro/`
15. **Update `.dockerignore`**: Remove `/frontend/.astro`
16. **Update CI/CD**: `.github/workflows/deploy.yaml` env var names
17. **Build test**: `bun run build` to verify output

## Dependencies

### Add

```json
{
  "preact": "^10.x",
  "@preact/signals": "^1.x",
  "react-map-gl": "^7.x",
  "vite": "^6.x",
  "@vitejs/plugin-preact": "^4.x",
  "vite-tsconfig-paths": "^5.x",
  "tailwindcss": "^4.x",
  "@tailwindcss/vite": "^4.x"
}
```

### Remove

```json
{
  "astro": "^5.5.5",
  "@astropub/worker": "^0.2.0",
  "astro-seo": "^0.8.4"
}
```

### Keep

```json
{
  "maplibre-gl": "^5.3.0",
  "cbor2": "^1.12.0",
  "zod": "^3.24.2",
  "lodash": "^4.17.21",
  "ts-essentials": "^10.0.4",
  "type-fest": "^4.38.0",
  "@types/lodash": "^4.17.16"
}
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `react-map-gl` + `preact/compat` compatibility issues | Well-proven pattern; alias `react` → `preact/compat` in Vite config |
| Custom MapLibre features (arrow image, custom sources/layers) | Use `react-map-gl`'s imperative API via `ref` for `addImage()`, custom sources/layers via declarative `<Source>` + `<Layer>` |
| Marker performance with many vehicles | `react-map-gl` `<Marker>` renders DOM elements; use `signal.peek()` for non-reactive reads and `useMemo` to minimize re-renders |
| `@astropub/worker` removal | Worker was imported via `?worker` Astro query; in Vite, use `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` |
| Tailwind v4 changes from v3 | Using `@tailwindcss/vite` plugin; no `tailwind.config.js` needed with v4 |
