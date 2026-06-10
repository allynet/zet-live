# Plan: Migrate Frontend from Preact to React + Zustand

## Goal

Replace the Preact + `@preact/signals` frontend stack with React + Zustand for state management. Drop the `preact/compat` shim layer. The three React-only libraries already in use (`react-map-gl`, `sonner`, `motion`) become native dependencies instead of compat-bridged ones.

## Overview

The migration has three major axes:

1. **Framework swap**: Preact → React. This touches build config (Vite plugin, tsconfig JSX source), entry point (`render` → `createRoot`), import paths (`preact/hooks` → `react`), and JSX attribute names (`class` → `className`).

2. **State management rewrite**: `@preact/signals` → Zustand. The 23+ `signal()` declarations and their imperative `.value` reads/writes across 16 files become a Zustand store with `get()`/`set()` actions. Derived state (`computed()`) becomes inline selectors or standalone derived getters. The `useSignalState` bridge hook is deleted entirely — components use Zustand's `useStore` with selectors instead.

3. **React-only libs become native**: `react-map-gl`, `sonner`, and `motion` no longer need the `react` → `preact/compat` alias. They import from real `react`/`react-dom`.

### Why Zustand alone (not Jotai + Zustand)

Jotai and Zustand solve different problems: Jotai is atom-based (bottom-up), Zustand is store-based (top-down). The current Preact signals are used as a flat global store — all signals are module-level, accessed imperatively from both components and plain functions (e.g., `state-actions.ts`). This maps cleanly to a single Zustand store:

- **Signals = store state**: Each `signal()` becomes a property in the store's state object.
- **`.value` reads = `get()`**: Imperative reads outside components (e.g., `vehiclesSignal.value` in `state-actions.ts`) become `useStore.getState().vehicles`.
- **`.value` writes = `set()`**: Direct mutations become store actions.
- **`computed()` = derived selectors**: `selectedVehicleSignal` becomes a `useMemo` inside consuming components or a standalone getter function.
- **`useSignalState()` = `useStore(selector)`**: The bridge hook is replaced by Zustand's built-in selector API.

Adding Jotai on top would be redundant — Zustand already handles both the global store pattern and fine-grained subscriptions via selectors. Jotai's atom model would also be awkward for the imperative read/write pattern used extensively in `state-actions.ts` and `use-stops.ts`.

### Why not other alternatives

| Alternative | Why not |
|---|---|
| Redux Toolkit | Heavier boilerplate, overkill for this app's ~23 state fields. Zustand's `set()`/`get()` is simpler. |
| MobX | Observable-based, similar mental model to signals, but Zustand is more idiomatic React (immutable updates, hooks). |
| Valtio | Proxy-based mutable API. Closer to signals but less ecosystem traction than Zustand. |
| React Context + useReducer | No built-in way to read state outside components (needed for `state-actions.ts`). Would require a custom external store. |
| Jotai alone | Atoms don't support imperative reads outside React as naturally as `store.getState()`. Would need `getDefaultStore()` patterns. |

## File Operations

### Delete

| File | Reason |
|---|---|
| `frontend/src/hooks/use-signal-state.ts` | Bridge hook for Preact signals — replaced by `useStore` selectors |

### Create

| File | Purpose |
|---|---|
| `frontend/src/store.ts` | Zustand store with all state slices and actions |

### Modify

| File | Changes |
|---|---|
| `frontend/package.json` | Swap Preact deps for React + Zustand |
| `frontend/vite.config.ts` | Replace `@preact/preset-vite` with `@vitejs/plugin-react`, remove compat aliases |
| `frontend/tsconfig.json` | Remove `jsxImportSource: "preact"` |
| `frontend/eslint.config.mjs` | Update `react` settings (remove `pragma: "h"`, set `version: "detect"`) |
| `frontend/src/main.tsx` | `render()` → `createRoot().render()` |
| `frontend/src/app.tsx` | Replace `useSignalState` calls with `useStore` selectors, `class` → `className`, imports |
| `frontend/src/state.ts` | Delete (replaced by `store.ts`). Types (`GroupedStop`, `VehicleLocationPair`, `StopArrivalTime`, `SelectedStop`) move to `store.ts` |
| `frontend/src/state-actions.ts` | Replace signal `.value` with `useStore.getState()`/`useStore.setState()` |
| `frontend/src/settings.ts` | Replace `signal`/`computed` with Zustand sub-store or separate Zustand store |
| `frontend/src/hooks/use-stops.ts` | Replace `batch` + signal writes with Zustand `set()`, replace `useSignalState` |
| `frontend/src/hooks/use-websocket.ts` | Replace signal writes with store actions, `preact/hooks` → `react` |
| `frontend/src/hooks/use-theme.ts` | Replace signals with Zustand, remove `useSignalEffect` |
| `frontend/src/hooks/use-url-sync.ts` | Replace `effect`/`useSignalEffect` with `useEffect` + store subscriptions |
| `frontend/src/hooks/use-version-check.ts` | `preact/hooks` → `react` |
| `frontend/src/hooks/use-wake-lock.ts` | `preact/hooks` → `react` |
| `frontend/src/hooks/use-geolocation-permission.ts` | `preact/hooks` → `react` |
| `frontend/src/components/map-container.tsx` | Replace `useSignalState`/`useSignalEffect` with Zustand selectors, `class` → `className`, imports |
| `frontend/src/components/bottom-sheet.tsx` | `class` → `className`, `preact/hooks` → `react`, `ComponentChildren` → `ReactNode` |
| `frontend/src/components/vehicle-sheet.tsx` | `class` → `className`, `preact/hooks` → `react` |
| `frontend/src/components/stop-sheet.tsx` | `class` → `className` (already minimal) |
| `frontend/src/components/settings-modal.tsx` | Replace signals/state hooks, `class` → `className`, imports |
| `frontend/src/components/status-bar.tsx` | Replace `useSignalState`, `preact/hooks` → `react` |
| `frontend/src/components/search-bar.tsx` | Replace `useSignalState`/signal writes, `class` → `className`, imports |
| `frontend/src/components/loading-screen.tsx` | Replace `useSignalState`, `class` → `className`, imports |

### Keep Unchanged

| File | Reason |
|---|---|
| `frontend/src/scripts/worker.ts` | Framework-agnostic web worker |
| `frontend/src/hooks/use-worker.ts` | Only uses framework-agnostic types (no Preact imports) |
| `frontend/src/app/entity/**` | Pure data types, Zod schemas — no framework dependency |
| `frontend/src/app/consts.ts` | Uses `import.meta.env` — framework-agnostic |
| `frontend/src/utils/**` | Pure utility functions |
| `frontend/src/data/maps/style/*.json` | Static map style files |
| `frontend/public/**` | Static assets |
| `frontend/index.html` | Unchanged |
| `frontend/.prettierrc` | Unchanged |
| `frontend/.editorconfig` | Unchanged |

## Design Decisions

### 1. Single Zustand store (not split stores)

**Why**: The current 23 signals form one logical domain. Splitting into multiple stores would add indirection without benefit. A single store with typed slices keeps things simple and colocated.

**Implementation**: `create<StoreState>()((set, get) => ({ ... }))` with all state fields and mutation methods.

**Notes**: Zustand supports store splitting via `combine` and slice patterns if needed later, but YAGNI for this size.

### 2. Settings as a separate Zustand store

**Why**: Settings are orthogonal to the main transit data. They have their own persistence (localStorage), their own update pattern (user-initiated only), and don't interact with the real-time WebSocket data. A separate store keeps concerns clean.

**Implementation**: `createSettingsStore()` in `settings.ts` replacing the current `settingsSignal`. The `useSetting()` hook becomes a simple `useStore(settingsStore, (s) => s[key])` selector.

### 3. Store subscriptions outside React

**Why**: `state-actions.ts` and `use-stops.ts` read/write state imperatively (not inside components). Preact signals support this natively via `.value`. Zustand supports it via `store.getState()` and `store.setState()`.

**Implementation**:
```ts
// Reading state imperatively:
const vehicle = useStore.getState().vehicles.get(mapId);

// Writing state imperatively:
useStore.setState({ followingVehicleId: mapId });
```

**Notes**: This is the primary reason Zustand was chosen over React Context or Jotai — `getState()`/`setState()` work outside React render cycles.

### 4. `useSignalEffect` → `useEffect` with explicit deps

**Why**: `useSignalEffect` automatically tracks which signals are read inside the callback. React's `useEffect` requires explicit dependency arrays. Each usage needs manual dependency listing.

**Implementation**: Every `useSignalEffect(() => { ... })` becomes `useEffect(() => { ... }, [dep1, dep2])` where the deps are the Zustand selector values.

**Notes**: There are 5 `useSignalEffect` call sites:
- `map-container.tsx` (follow vehicle, fly to target)
- `use-theme.ts` (recompute theme)
- `use-url-sync.ts` (sync URL params)
- `use-signal-state.ts` (deleted — no replacement needed)

### 5. `effect()` (standalone) → `useEffect` + store subscription

**Why**: `use-url-sync.ts` uses `effect()` (non-hook form) to wait for `simpleStopsSignal` to be populated before restoring URL state. This auto-disposes pattern needs to become a `useEffect` with a check.

**Implementation**:
```ts
// Before (Preact):
const dispose = effect(() => {
  if (Object.keys(simpleStopsSignal.value).length === 0) return;
  selectVehicle(vehicleParam, tripParam ?? "");
  dispose();
});

// After (React):
useEffect(() => {
  const stops = useStore.getState().simpleStops;
  if (Object.keys(stops).length === 0) return;
  selectVehicle(vehicleParam, tripParam ?? "");
}, [simpleStops]); // simpleStops from useStore selector
```

### 6. `batch()` → single `setState` call

**Why**: Preact's `batch()` groups multiple signal writes into one update. Zustand already batches — a single `setState({ ... })` call is atomic by default.

**Implementation**: Replace all `batch(() => { signalA.value = x; signalB.value = y; })` with `useStore.setState({ fieldA: x, fieldB: y })`.

### 7. Derived state (`computed()`) → selectors or getter functions

**Why**: The only `computed()` signals are `selectedVehicleSignal` and `settingSignal(key)`. In Zustand, derived state is computed at the selector level inside components.

**Implementation**:
```ts
// selectedVehicleSignal (was computed):
const selectedVehicle = useStore((s) =>
  s.followingVehicleId ? s.vehicles.get(s.followingVehicleId) ?? null : null
);

// settingSignal(key) (was computed per-key):
const value = useStore(settingsStore, (s) => s[key]);
```

### 8. Theme signals as module-level state (not in store)

**Why**: `resolvedThemeSignal` and `resolvedMapStyleIdSignal` are consumed by components but don't need to be in the main store. They're derived from settings and don't interact with transit data.

**Implementation**: Keep as a small separate Zustand store or as React state inside the `useTheme` hook propagated via context. Simplest: separate small Zustand store exported from `use-theme.ts`.

### 9. `class` → `className` bulk replacement

**Why**: React requires `className` instead of `class` for the HTML `class` attribute. The codebase has 112 instances across 9 component files.

**Implementation**: Regex search-and-replace `class=` → `className=` in all `.tsx` files. Must be careful not to touch `class` in strings, template literals, or CSS class names within strings. Only the JSX attribute `class=` needs changing.

### 10. MapGL `class` prop → `className`

**Why**: `react-map-gl`'s `<MapGL>` component accepts a `className` prop (React convention), not `class` (Preact convention). The single instance in `map-container.tsx` line 427 needs updating.

## Detailed Changes

### 1. `frontend/package.json`

**Remove:**
```json
{
  "preact": "^10.26.5",
  "@preact/signals": "^1.3.1",
  "@preact/preset-vite": "^2.10.5"
}
```

**Add:**
```json
{
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "zustand": "^5.0.5",
  "@vitejs/plugin-react": "^4.5.2",
  "@types/react": "^19.1.6",
  "@types/react-dom": "^19.1.6"
}
```

**Notes**: `react-map-gl` v8, `sonner` v2, and `motion` v12 stay — they're React-native already and were only working via the compat shim. The `@types/react` and `@types/react-dom` are needed for TypeScript support since we're no longer using Preact's built-in types.

### 2. `frontend/vite.config.ts`

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  define: {
    __DATE__: `"${new Date().toISOString()}"`,
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: "_static/file.[name].[hash].[ext]",
        chunkFileNames: "_static/chunk.[name].[hash].js",
        entryFileNames: "_static/entry.[name].[hash].js",
        manualChunks(id) {
          if (id.includes("/style/") && id.endsWith(".json")) {
            const name = id.split("/").pop()!.split(".").slice(0, -1).join(".");
            return `map-style-${name}`;
          }
          if (id.includes("/node_modules/@vis.gl/") || id.includes("/node_modules/maplibre-gl/")) {
            return "map";
          }
          if (id.includes("/node_modules/framer-motion/") || id.includes("/node_modules/motion")) {
            return "motion";
          }
          if (id.includes("/node_modules/")) {
            return "vendor";
          }
          return null;
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
  },
});
```

**Changes**: `preact()` plugin → `react()` plugin. Remove `resolve.alias` block entirely (no more compat shim).

### 3. `frontend/tsconfig.json`

Remove `"jsxImportSource": "preact"` from `compilerOptions`. The `jsx: "react-jsx"` setting remains — it defaults to React's automatic JSX runtime.

### 4. `frontend/eslint.config.mjs`

Update the `react` settings block:
```js
settings: {
  react: {
    version: "detect",
  },
},
```

Remove `pragma: "h"` (Preact-specific) and `version: "16.0"` (hardcoded compat version). `"detect"` auto-detects from `package.json`.

### 5. `frontend/src/store.ts` (new file)

The Zustand store replaces both `state.ts` and the imperative mutation patterns in `state-actions.ts`. The store contains:

- All state fields from `state.ts` (23 signals → 23 state properties)
- Action methods for mutations currently in `state-actions.ts`
- The `updateMaxBounds` helper as a store method

```ts
import { create } from "zustand";
import type { VehicleV1 } from "./app/entity/v1/vehicle";
import type { StopV1 } from "./app/entity/v1/stop";

export type GroupedStop = { name: string; lat: number; lng: number; ids: string[] };
export type VehicleLocationPair = { from: [number, number]; to: [number, number]; color: string };
export type StopArrivalTime = { tripId: string; vehicleId: string; routeId: string; stopId: string; arrivalTime: number | null };
export type SelectedStop = { name: string; ids: string[]; routes: string[] };

export type StoreState = {
  vehicles: Map<string, VehicleV1>;
  vehicleBounds: [[number, number], [number, number]];
  simpleStops: Record<string, StopV1>;
  stopsGrouped: GroupedStop[];
  activeStopIds: Set<string>;
  stopBounds: [[number, number], [number, number]];
  followingVehicleId: string | null;
  followEnabled: boolean;
  followingStopIds: string[];
  followingTripId: string | null;
  followingTripIds: Set<string> | null;
  deltaMoveLines: VehicleLocationPair[];
  followingRoute: [number, number][] | null;
  tripStopTimes: Map<string, number> | null;
  stopArrivalTimes: StopArrivalTime[] | null;
  selectedStop: SelectedStop | null;
  displayedStops: GroupedStop[];
  lastUpdate: number | null;
  lastError: string | null;
  wsConnected: boolean;
  mapReady: boolean;
  maxBounds: [[number, number], [number, number]] | null;
  flyToTarget: { longitude: number; latitude: number } | null;
  searchMatchedVehicleMapIds: Set<string> | null;
  searchMatchedStopIds: Set<string> | null;
};

export const useStore = create<StoreState>()(() => ({
  vehicles: new Map(),
  vehicleBounds: [[-89.5, -89.5], [89.5, 89.5]],
  simpleStops: {},
  stopsGrouped: [],
  activeStopIds: new Set(),
  stopBounds: [[-89.5, -89.5], [89.5, 89.5]],
  followingVehicleId: null,
  followEnabled: false,
  followingStopIds: [],
  followingTripId: null,
  followingTripIds: null,
  deltaMoveLines: [],
  followingRoute: null,
  tripStopTimes: null,
  stopArrivalTimes: null,
  selectedStop: null,
  displayedStops: [],
  lastUpdate: null,
  lastError: null,
  wsConnected: false,
  mapReady: false,
  maxBounds: null,
  flyToTarget: null,
  searchMatchedVehicleMapIds: null,
  searchMatchedStopIds: null,
}));
```

### 6. `frontend/src/settings.ts`

Replace the signal-based settings with a separate Zustand store. The `loadSettings()` and `persist()` functions stay unchanged — they handle localStorage serialization. The `settingSignal()` and `useSetting()` helpers become Zustand selector wrappers.

```ts
import { create } from "zustand";
import { useStore } from "./store";

// ... existing types and DEFAULTS ...

const settingsStore = create<Settings>()(() => loadSettings());

export function useSetting<T extends keyof Settings>(key: T): Settings[T] {
  return settingsStore((s) => s[key]);
}

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settingsStore.setState({ [key]: value });
  persist(settingsStore.getState());
}

export { settingsStore };
```

**Notes**: The `settingSignal()` function (which returned `computed()` signals) is replaced by inline selectors. The `useSetting` hook uses `settingsStore(selector)` directly.

### 7. `frontend/src/state.ts` → deleted

All types and state declarations move to `store.ts`. The file is deleted.

### 8. `frontend/src/state-actions.ts`

Replace all `*.value =` writes with `useStore.setState()`. Replace all `*.value` reads with `useStore.getState()`.

### 9. `frontend/src/hooks/use-signal-state.ts` → deleted

No replacement needed. Components use `useStore(selector)` directly.

### 10. Component migration pattern

Every component follows this pattern:

```diff
- import { useState, useEffect } from "preact/hooks";
+ import { useState, useEffect } from "react";
- import { useSignalState } from "@/hooks/use-signal-state";
- import { someSignal } from "@/state";
+ import { useStore } from "@/store";
- import type { ComponentChildren } from "preact";
+ import type { ReactNode } from "react";

- const value = useSignalState(someSignal);
+ const value = useStore((s) => s.someField);

- <div class="...">
+ <div className="...">

- signal.value = newValue;
+ useStore.setState({ field: newValue });
```

### 11. `frontend/src/hooks/use-theme.ts`

The `resolvedThemeSignal` and `resolvedMapStyleIdSignal` become either:
- A separate small Zustand store, or
- React state propagated via context/hooks

Simplest approach: separate small Zustand store exported from `use-theme.ts`. The `useSignalEffect` becomes `useEffect` with settings selectors as deps.

### 12. `frontend/src/hooks/use-url-sync.ts`

The two `effect()` calls (non-hook auto-dispose pattern) become `useEffect` with cleanup:
```ts
useEffect(() => {
  const stops = useStore.getState().simpleStops;
  if (Object.keys(stops).length === 0) return;
  selectVehicle(vehicleParam, tripParam ?? "");
  if (follow) useStore.setState({ followEnabled: true });
}, [simpleStops]); // simpleStops from useStore selector
```

### 13. `frontend/src/main.tsx`

```diff
- import { render } from "preact";
+ import { createRoot } from "react-dom/client";
  import "@/app.css";
  import { App } from "@/app";

- render(<App />, document.getElementById("app")!);
+ createRoot(document.getElementById("app")!).render(<App />);
```

## Implementation Order

1. Install React + Zustand deps, remove Preact deps (`bun install`)
2. Update build config (`vite.config.ts`, `tsconfig.json`)
3. Update lint config (`eslint.config.mjs`)
4. Create `frontend/src/store.ts` (Zustand store from `state.ts` state)
5. Rewrite `frontend/src/settings.ts` (Zustand settings store)
6. Rewrite `frontend/src/hooks/use-theme.ts` (remove signals)
7. Delete `frontend/src/hooks/use-signal-state.ts`
8. Delete `frontend/src/state.ts`
9. Rewrite `frontend/src/state-actions.ts` (store getters/setters)
10. Rewrite `frontend/src/hooks/use-stops.ts` (store mutations)
11. Rewrite `frontend/src/hooks/use-websocket.ts` (store mutations, imports)
12. Rewrite `frontend/src/hooks/use-url-sync.ts` (store subscriptions)
13. Update remaining hooks (import paths only): `use-version-check.ts`, `use-wake-lock.ts`, `use-geolocation-permission.ts`
14. Rewrite `frontend/src/main.tsx` (entry point)
15. Rewrite `frontend/src/app.tsx` (root component)
16. Rewrite all components: imports, `class` → `className`, `useSignalState` → `useStore`
17. Run `bun build` to verify compilation
18. Run `bun lint:fix` and `bun format` to fix issues

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Zustand re-render granularity — `useStore()` without a selector subscribes to all changes | Always use selectors: `useStore((s) => s.vehicles)`. ESLint can enforce this via `react-hooks/exhaustive-deps`. |
| `Map` and `Set` reference equality — Zustand uses `Object.is` for comparisons | Always create new `Map`/`Set` instances on update (already done in current code — `new Map(...)`, `new Set(...)`). Never mutate in place. |
| Missing `className` replacements cause silent CSS failures | Grep for remaining `class=` in TSX files after migration. React ignores the `class` attribute (it passes it through as `class` on the DOM element, but some components like `MapGL` may not forward it). |
| `useEffect` dependency arrays are more brittle than `useSignalEffect` auto-tracking | Each `useSignalEffect` site is manually audited. There are only 5 sites — manageable. |
| Motion library drag handler types may differ between Preact/React compat vs native React | `motion/react` types should be cleaner with native React. Test drag interactions in the bottom sheet. |
| `react-map-gl` performance may differ | Was already running through compat; native React should be equal or better. Monitor first render and interaction FPS. |
| No tests exist to catch regressions | Manual testing of: WebSocket connection, vehicle rendering, stop rendering, search, settings modal, bottom sheet drag, theme switching, URL sync. |
