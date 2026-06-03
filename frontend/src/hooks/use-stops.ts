import { batch } from "@preact/signals";
import type { V1Message } from "@/app/entity/v1/message";
import {
  parseResponse,
  tripInfoResponseSchema,
  tripStopTimesResponseSchema,
  stopArrivalsResponseSchema,
  stopTripsResponseSchema,
} from "@/app/entity/v1/api";
import { VehicleV1 } from "@/app/entity/v1/vehicle";
import { StopV1 } from "@/app/entity/v1/stop";
import { API_URL } from "@/app/consts";
import {
  vehiclesSignal,
  vehicleBoundsSignal,
  simpleStopsSignal,
  deltaMoveLinesSignal,
  followingVehicleIdSignal,
  followingStopIdsSignal,
  followingRouteSignal,
  followingTripIdSignal,
  displayedStopsSignal,
  stopsGroupedSignal,
  tripStopTimesSignal,
  stopArrivalTimesSignal,
  stopBoundsSignal,
  type VehicleLocationPair,
  updateMaxBounds,
} from "@/state";
import type { StopsUpdateResponse } from "./use-worker";

export function handleStopsUpdate(response: StopsUpdateResponse) {
  if (response.stops) {
    const stops = response.stops.map((s) => new StopV1(s));

    batch(() => {
      simpleStopsSignal.value = Object.fromEntries(stops.map((stop) => [stop.id, stop]));
      if (response.bounds) {
        stopBoundsSignal.value = response.bounds;
      }
      updateMaxBounds();
    });

    console.log("Updating stops");
  }

  stopsGroupedSignal.value = response.grouped;

  if (!followingVehicleIdSignal.value && followingStopIdsSignal.value.length === 0) {
    displayedStopsSignal.value = response.grouped;
  }
}

export function processMessage(message: V1Message) {
  if (typeof message.d === "object" && "vehicles" in message.d) {
    const rawVehicles = message.d.vehicles;
    const currentMap = vehiclesSignal.value;
    const locationPairs: VehicleLocationPair[] = [];

    let minLat = 89.5;
    let maxLat = -89.5;
    let minLng = 89.5;
    let maxLng = -89.5;

    const newMap = new Map<string, VehicleV1>();

    for (const raw of rawVehicles) {
      const row = raw as (string | number)[];
      const vehicle = VehicleV1.fromSimple(row);
      const key = vehicle.getMapId();

      const existing = currentMap.get(key);
      if (existing) {
        if (existing.prevLat !== null && existing.prevLng !== null) {
          locationPairs.push({
            from: [existing.prevLng, existing.prevLat],
            to: [vehicle.lng, vehicle.lat],
            color: Number(vehicle.routeId) >= 100 ? "#00f" : "#f00",
          });
        }
      }

      newMap.set(key, vehicle);

      minLat = Math.min(minLat, vehicle.lat);
      maxLat = Math.max(maxLat, vehicle.lat);
      minLng = Math.min(minLng, vehicle.lng);
      maxLng = Math.max(maxLng, vehicle.lng);
    }

    batch(() => {
      vehiclesSignal.value = newMap;
      vehicleBoundsSignal.value = [
        [minLng, minLat],
        [maxLng, maxLat],
      ];
      deltaMoveLinesSignal.value = locationPairs;
      updateMaxBounds();
    });

    const now = Date.now();
    if (now - lastStopTimesRefresh >= STOP_TIMES_REFRESH_INTERVAL) {
      lastStopTimesRefresh = now;

      const tripId = followingTripIdSignal.value;
      const stopIds = followingStopIdsSignal.value;

      if (tripId) {
        void refreshTripStopTimes(tripId);
      } else if (stopIds.length > 0) {
        void refreshStopArrivalTimes(stopIds);
      }
    }
  }
}

let followingRouteAbort: AbortController | null = null;
let followingRouteRefreshAbort: AbortController | null = null;

export async function fetchFollowingRoute(tripId: string) {
  followingRouteAbort?.abort();
  followingRouteRefreshAbort?.abort();
  followingRouteAbort = new AbortController();
  const { signal } = followingRouteAbort;

  const raw = await fetch(`${API_URL}/v1/schedule/trip-info/${tripId}`, { signal })
    .then((x) => x.json())
    .catch(() => null);
  const shape = parseResponse(raw, tripInfoResponseSchema);

  if (signal.aborted) return;

  if (!shape) {
    console.error("Shape not found for trip", tripId);
    return;
  }

  followingRouteSignal.value = shape.d.route;

  const simpleStops = simpleStopsSignal.value;
  const stops = shape.d.stopIds.map((id) => simpleStops[id]).filter(Boolean);

  displayedStopsSignal.value = stops.map((stop) => ({
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    ids: [stop.id],
  }));

  const map = new Map<string, number>();
  for (const s of shape.d.stopTimes) {
    if (s.arrivalTime !== null) {
      map.set(s.stopId, s.arrivalTime);
    }
  }
  tripStopTimesSignal.value = map;
}

let stopTripsAbort: AbortController | null = null;
let stopTripsRefreshAbort: AbortController | null = null;

let lastStopTimesRefresh = 0;
const STOP_TIMES_REFRESH_INTERVAL = 15_000;

async function refreshTripStopTimes(tripId: string) {
  followingRouteRefreshAbort?.abort();
  followingRouteRefreshAbort = new AbortController();
  const { signal } = followingRouteRefreshAbort;

  const raw = await fetch(`${API_URL}/v1/schedule/trip-info/${tripId}`, { signal })
    .then((x) => x.json())
    .catch(() => null);
  const shape = parseResponse(raw, tripStopTimesResponseSchema);

  if (signal.aborted) return;

  if (!shape) return;

  const map = new Map<string, number>();
  for (const s of shape.d.stopTimes) {
    if (s.arrivalTime !== null) {
      map.set(s.stopId, s.arrivalTime);
    }
  }
  tripStopTimesSignal.value = map;
}

async function refreshStopArrivalTimes(stopIds: string[]) {
  stopTripsRefreshAbort?.abort();
  stopTripsRefreshAbort = new AbortController();
  const { signal } = stopTripsRefreshAbort;

  const queryParams = new URLSearchParams();
  for (const stopId of stopIds) {
    queryParams.append("stop", stopId);
  }
  const raw = await fetch(`${API_URL}/v1/schedule/stop-trips?${queryParams.toString()}`, {
    signal,
  })
    .then((x) => x.json())
    .catch(() => null);
  const res = parseResponse(raw, stopArrivalsResponseSchema);

  if (signal.aborted) return;

  stopArrivalTimesSignal.value = res?.d.arrivalTimes ?? null;
}

export async function fetchStopTrips(stopIds: string[]) {
  stopTripsAbort?.abort();
  stopTripsRefreshAbort?.abort();
  stopTripsAbort = new AbortController();
  const { signal } = stopTripsAbort;

  const queryParams = new URLSearchParams();
  for (const stopId of stopIds) {
    queryParams.append("stop", stopId);
  }
  const raw = await fetch(`${API_URL}/v1/schedule/stop-trips?${queryParams.toString()}`, {
    signal,
  })
    .then((x) => x.json())
    .catch(() => null);
  const trips = parseResponse(raw, stopTripsResponseSchema);

  if (signal.aborted) return null;

  stopArrivalTimesSignal.value = trips?.d.arrivalTimes ?? null;

  return trips?.d.stopTrips ?? null;
}
