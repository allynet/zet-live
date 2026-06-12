import { create } from "zustand";
import { z } from "zod";
import type { VehicleV1 } from "./app/entity/v1/vehicle";
import type { StopV1 } from "./app/entity/v1/stop";
import type { GroupedStop } from "./app/entity/shared";
import { stopArrivalTimeSchema } from "./app/entity/v1/api";

export type { GroupedStop };

export type VehicleLocationPair = {
  from: [number, number];
  to: [number, number];
  color: string;
};

export type StopArrivalTime = z.infer<typeof stopArrivalTimeSchema>;

export type SelectedStop = {
  name: string;
  ids: string[];
  routes: string[];
};

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

  tripFetchError: string | null;
  stopFetchError: string | null;

  lastUpdate: number | null;
  lastError: string | null;
  wsConnected: boolean;

  mapReady: boolean;

  maxBounds: [[number, number], [number, number]] | null;

  flyToTarget: { longitude: number; latitude: number } | null;

  searchMatchedVehicleMapIds: Set<string> | null;
  searchMatchedStopIds: Set<string> | null;
};

const DEFAULT_BOUNDS: [[number, number], [number, number]] = [
  [-89.5, -89.5],
  [89.5, 89.5],
];

export const useStore = create<StoreState>()(() => ({
  vehicles: new Map(),
  vehicleBounds: DEFAULT_BOUNDS,

  simpleStops: {},
  stopsGrouped: [],
  activeStopIds: new Set(),
  stopBounds: DEFAULT_BOUNDS,

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

  tripFetchError: null,
  stopFetchError: null,

  lastUpdate: null,
  lastError: null,
  wsConnected: false,

  mapReady: false,

  maxBounds: null,

  flyToTarget: null,

  searchMatchedVehicleMapIds: null,
  searchMatchedStopIds: null,
}));

export function updateMaxBounds() {
  const { stopBounds, vehicleBounds } = useStore.getState();
  const pad = 0.05;

  useStore.setState({
    maxBounds: [
      [
        Math.min(stopBounds[0][0], vehicleBounds[0][0]) - pad,
        Math.min(stopBounds[0][1], vehicleBounds[0][1]) - pad,
      ],
      [
        Math.max(stopBounds[1][0], vehicleBounds[1][0]) + pad,
        Math.max(stopBounds[1][1], vehicleBounds[1][1]) + pad,
      ],
    ],
  });
}
