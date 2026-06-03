import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import Fuse from "fuse.js";
import {
  vehiclesSignal,
  stopsGroupedSignal,
  searchMatchedVehicleMapIdsSignal,
  searchMatchedStopIdsSignal,
  flyToTargetSignal,
} from "@/state";
import { selectVehicle, selectStop } from "@/state-actions";
import { useSignalState } from "@/hooks/use-signal-state";
import type { VehicleV1 } from "@/app/entity/v1/vehicle";
import type { GroupedStop } from "@/state";

type VehicleRouteGroup = {
  routeId: string;
  displayName: string;
  vehicles: VehicleV1[];
};

type UnifiedSearchResult =
  | { type: "station"; score: number; item: GroupedStop }
  | { type: "vehicle"; score: number; item: VehicleRouteGroup };

type CategoryFilters = {
  stations: boolean;
  trams: boolean;
  buses: boolean;
};

type SearchableItem =
  | { type: "station"; label: string; routeId: string; data: GroupedStop }
  | { type: "tram"; label: string; routeId: string; data: VehicleRouteGroup }
  | { type: "bus"; label: string; routeId: string; data: VehicleRouteGroup };

function isTramRoute(routeId: string): boolean {
  return routeId.length <= 2;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [filters, setFilters] = useState<CategoryFilters>({
    stations: true,
    trams: true,
    buses: true,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const vehicles = useSignalState(vehiclesSignal);
  const stopsGrouped = useSignalState(stopsGroupedSignal);

  const searchableItems = useMemo<SearchableItem[]>(() => {
    const items: SearchableItem[] = [];

    for (const stop of stopsGrouped) {
      items.push({
        type: "station",
        label: stop.name,
        routeId: "",
        data: stop,
      });
    }

    const groups = new Map<string, VehicleRouteGroup>();
    for (const v of vehicles.values()) {
      const displayName = v.getDisplayName();
      const key = `${v.routeId}|${displayName}`;
      const existing = groups.get(key);
      if (existing) {
        existing.vehicles.push(v);
      } else {
        groups.set(key, {
          routeId: v.routeId,
          displayName,
          vehicles: [v],
        });
      }
    }

    for (const group of groups.values()) {
      items.push({
        type: isTramRoute(group.routeId) ? "tram" : "bus",
        label: group.displayName,
        routeId: group.routeId,
        data: group,
      });
    }

    return items;
  }, [vehicles, stopsGrouped]);

  const fuse = useMemo(
    () =>
      new Fuse(searchableItems, {
        keys: [
          { name: "routeId", weight: 1.0 },
          { name: "label", weight: 0.7 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
        shouldSort: true,
      }),
    [searchableItems],
  );

  const results = useMemo<UnifiedSearchResult[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    if (filters.trams || filters.buses) {
      const exactMatches = searchableItems.filter(
        (item) => item.type !== "station" && item.routeId.toLowerCase() === normalizedQuery,
      );
      const filtered = exactMatches.filter((item) => {
        if (item.type === "tram" && !filters.trams) return false;
        if (item.type === "bus" && !filters.buses) return false;
        return true;
      });

      if (filtered.length > 0) {
        return filtered.map((item) => ({
          type: "vehicle" as const,
          score: 0,
          item: item.data,
        }));
      }
    }

    const fuseResults = fuse.search(normalizedQuery, { limit: 50 });
    const combined: UnifiedSearchResult[] = [];

    console.log(fuseResults);

    for (const r of fuseResults) {
      const item = r.item;
      if (item.type === "station" && !filters.stations) continue;
      if (item.type === "tram" && !filters.trams) continue;
      if (item.type === "bus" && !filters.buses) continue;

      combined.push({
        type: item.type === "station" ? "station" : "vehicle",
        score: r.score ?? 1,
        item: item.data,
      });
    }

    return combined.slice(0, 10);
  }, [query, fuse, filters, searchableItems]);

  useEffect(() => {
    if (!query.trim()) {
      searchMatchedVehicleMapIdsSignal.value = null;
      searchMatchedStopIdsSignal.value = null;
      return;
    }

    const vehicleIds = new Set<string>();
    const stopIds = new Set<string>();

    for (const r of results) {
      if (r.type === "station") {
        for (const id of r.item.ids) {
          stopIds.add(id);
        }
      } else {
        for (const v of r.item.vehicles) {
          vehicleIds.add(v.getMapId());
        }
      }
    }

    searchMatchedVehicleMapIdsSignal.value = vehicleIds;
    searchMatchedStopIdsSignal.value = stopIds;
  }, [results, query]);

  useEffect(() => {
    return () => {
      searchMatchedVehicleMapIdsSignal.value = null;
      searchMatchedStopIdsSignal.value = null;
    };
  }, []);

  const handleSelectStation = useCallback((station: GroupedStop) => {
    flyToTargetSignal.value = { longitude: station.lng, latitude: station.lat };
    selectStop(station.ids);
    setQuery("");
    inputRef.current?.blur();
  }, []);

  const handleSelectVehicle = useCallback((group: VehicleRouteGroup) => {
    const first = group.vehicles[0];
    if (first) {
      selectVehicle(first.id, first.tripId, true);
    }
    setQuery("");
    inputRef.current?.blur();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery("");
        inputRef.current?.blur();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < results.length) {
        e.preventDefault();
        const result = results[focusedIndex];
        if (!result) return;
        if (result.type === "station") {
          handleSelectStation(result.item);
        } else {
          handleSelectVehicle(result.item);
        }
      }
    },
    [focusedIndex, results, handleSelectStation, handleSelectVehicle],
  );

  useEffect(() => {
    setFocusedIndex(-1);
  }, [query, filters]);

  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;

  const toggleFilter = useCallback((key: keyof CategoryFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div
      ref={containerRef}
      class="pointer-events-auto overflow-hidden rounded-xl bg-white/85 shadow-md backdrop-blur-sm"
    >
      <div class="flex items-center gap-2 px-3 py-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 text-gray-500"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search stations or routes..."
          class="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        {hasQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              setQuery("");
            }}
            class="flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>

      {hasQuery && (
        <div class="border-t border-black/5">
          <div class="flex items-center gap-1.5 px-3 py-1.5">
            <button
              type="button"
              onClick={() => {
                toggleFilter("stations");
              }}
              class={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                filters.stations
                  ? "bg-gray-200 text-gray-700"
                  : "hover:bg-gray-150 bg-gray-100 text-gray-400"
              }`}
            >
              Stations
            </button>
            <button
              type="button"
              onClick={() => {
                toggleFilter("trams");
              }}
              class={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                filters.trams
                  ? "bg-red-100 text-red-700"
                  : "hover:bg-gray-150 bg-gray-100 text-gray-400"
              }`}
            >
              Trams
            </button>
            <button
              type="button"
              onClick={() => {
                toggleFilter("buses");
              }}
              class={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
                filters.buses
                  ? "bg-blue-100 text-blue-700"
                  : "hover:bg-gray-150 bg-gray-100 text-gray-400"
              }`}
            >
              Buses
            </button>
          </div>

          <div class="max-h-80 overflow-y-auto border-t border-black/5" role="listbox">
            {results.map((result, idx) => (
              <button
                key={
                  result.type === "station"
                    ? `s-${result.item.ids.join(",")}`
                    : `v-${result.item.routeId}-${result.item.vehicles[0]?.id ?? idx}`
                }
                type="button"
                role="option"
                aria-selected={focusedIndex === idx}
                class="flex w-full cursor-pointer flex-col gap-0.5 border-none bg-transparent px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  if (result.type === "station") {
                    handleSelectStation(result.item);
                  } else {
                    handleSelectVehicle(result.item);
                  }
                }}
                onFocus={() => {
                  setFocusedIndex(idx);
                }}
              >
                {result.type === "station" ? (
                  <>
                    <span class="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="shrink-0 text-gray-400"
                      >
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span class="font-medium">{result.item.name}</span>
                    </span>
                    <span class="pl-6 text-xs text-gray-400">
                      {result.item.ids.length === 1 ? "1 stop" : `${result.item.ids.length} stops`}
                    </span>
                  </>
                ) : (
                  <>
                    <span class="flex items-center gap-2">
                      <span
                        class="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold data-[color=blue]:bg-blue-100 data-[color=blue]:text-blue-800 data-[color=red]:bg-red-100 data-[color=red]:text-red-800"
                        data-color={result.item.routeId.length > 2 ? "blue" : "red"}
                      >
                        {result.item.routeId}
                      </span>
                      <span class="font-medium">{result.item.displayName}</span>
                    </span>
                    <span class="pl-7 text-xs text-gray-400">
                      {result.item.vehicles.length === 1
                        ? "1 vehicle"
                        : `${result.item.vehicles.length} vehicles`}
                    </span>
                  </>
                )}
              </button>
            ))}

            {!hasResults && (
              <div class="px-3 py-3 text-center text-sm text-gray-400" role="status">
                No results found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
