import { signal } from "@preact/signals";
import type { VehicleV1 } from "./app/entity/v1/vehicle";
import type { StopV1 } from "./app/entity/v1/stop";

export type GroupedStop = {
  name: string;
  lat: number;
  lng: number;
  ids: string[];
};

export type VehicleLocationPair = {
  from: [number, number];
  to: [number, number];
  color: string;
};

export const vehiclesSignal = signal<Map<string, VehicleV1>>(new Map());
export const vehicleBoundsSignal = signal<[[number, number], [number, number]]>([
  [-89.5, -89.5],
  [89.5, 89.5],
]);

export const simpleStopsSignal = signal<Record<string, StopV1>>({});
export const stopsGroupedSignal = signal<GroupedStop[]>([]);
export const activeStopIdsSignal = signal<Set<string>>(new Set());
export const stopBoundsSignal = signal<[[number, number], [number, number]]>([
  [-89.5, -89.5],
  [89.5, 89.5],
]);

export const followingVehicleIdSignal = signal<string | null>(null);
export const followEnabledSignal = signal(false);
export const followingStopIdsSignal = signal<string[]>([]);
export const followingTripIdSignal = signal<string | null>(null);
export const followingTripIdsSignal = signal<Set<string> | null>(null);

export const deltaMoveLinesSignal = signal<VehicleLocationPair[]>([]);
export const followingRouteSignal = signal<[number, number][] | null>(null);

export const tripStopTimesSignal = signal<Map<string, number> | null>(null);

export type StopArrivalTime = {
  tripId: string;
  vehicleId: string;
  routeId: string;
  stopId: string;
  arrivalTime: number | null;
};

export const stopArrivalTimesSignal = signal<StopArrivalTime[] | null>(null);

export type SelectedStop = {
  name: string;
  ids: string[];
  routes: string[];
};

export const selectedStopSignal = signal<SelectedStop | null>(null);

export const displayedStopsSignal = signal<GroupedStop[]>([]);

export const lastUpdateSignal = signal<number | null>(null);
export const lastErrorSignal = signal<string | null>(null);
export const wsConnectedSignal = signal(false);

export const maxBoundsSignal = signal<[[number, number], [number, number]] | null>(null);

export const flyToTargetSignal = signal<{ longitude: number; latitude: number } | null>(null);

export type MapStyleId = "3d" | "3d.dark" | "flat" | "satellite";

const MAP_STYLE_STORAGE_KEY = "map-style";

function loadMapStyleId(): MapStyleId {
  try {
    const stored = localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    if (stored === "3d" || stored === "3d.dark" || stored === "flat" || stored === "satellite") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "3d";
}

export const mapStyleIdSignal = signal<MapStyleId>(loadMapStyleId());

export function setMapStyleId(id: MapStyleId) {
  try {
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
    globalThis.location.reload();
  } catch {
    // localStorage unavailable
  }
}

export function updateMaxBounds() {
  const stopBounds = stopBoundsSignal.value;
  const vehicleBounds = vehicleBoundsSignal.value;
  const pad = 0.05;

  maxBoundsSignal.value = [
    [
      Math.min(stopBounds[0][0], vehicleBounds[0][0]) - pad,
      Math.min(stopBounds[0][1], vehicleBounds[0][1]) - pad,
    ],
    [
      Math.max(stopBounds[1][0], vehicleBounds[1][0]) + pad,
      Math.max(stopBounds[1][1], vehicleBounds[1][1]) + pad,
    ],
  ];
}
