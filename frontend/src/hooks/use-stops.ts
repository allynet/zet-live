import { useEffect, useCallback } from "preact/hooks";
import { batch } from "@preact/signals";
import type { V1Message } from "@/app/entity/v1/message";
import { VehicleV1 } from "@/app/entity/v1/vehicle";
import { StopV1 } from "@/app/entity/v1/stop";
import { API_URL } from "@/app/consts";
import {
  vehiclesSignal,
  vehicleBoundsSignal,
  simpleStopsSignal,
  activeStopIdsSignal,
  stopBoundsSignal,
  deltaMoveLinesSignal,
  followingVehicleIdSignal,
  followingStopIdsSignal,
  followingRouteSignal,
  followingTripIdSignal,
  displayedStopsSignal,
  stopsGroupedSignal,
  tripStopTimesSignal,
  stopArrivalTimesSignal,
  type GroupedStop,
  type VehicleLocationPair,
  type StopArrivalTime,
  updateMaxBounds,
} from "@/state";
import { getSharedWorker, postWorkerMessage } from "./use-worker";

export function useStops() {
  const fetchStops = useCallback(async () => {
    let success = false;

    while (!success) {
      success = await fetch(`${API_URL}/v1/schedule/simple-stops`, {
        headers: {
          accept: "application/cbor,application/json",
        },
      })
        .then((x) => x.arrayBuffer())
        .then((x) => {
          const worker = getSharedWorker();
          postWorkerMessage(worker, new Blob([x]));
          return true;
        })
        .catch(() => false);

      if (!success) {
        await new Promise((resolve) => setTimeout(resolve, 5000 + 5000 * Math.random()));
      }
    }
  }, []);

  useEffect(() => {
    void fetchStops();
    const interval = setInterval(() => void fetchStops(), 60_000 + 60_000 * Math.random());
    return () => {
      clearInterval(interval);
    };
  }, [fetchStops]);
}

function areaOf(stops: StopV1[]) {
  const lats = stops.map((s) => s.lat);
  const lngs = stops.map((s) => s.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return (maxLat - minLat) * (maxLng - minLng);
}

function computeGroupedStops() {
  const simpleStops = simpleStopsSignal.value;
  const activeStopIds = activeStopIdsSignal.value;

  type StopsByName = Record<string, StopV1[]>;
  const stopsByName = Object.values(simpleStops).reduce<StopsByName>((acc, a) => {
    if (!acc[a.name]) {
      acc[a.name] = [];
    }
    acc[a.name]!.push(a);
    return acc;
  }, {});

  requestIdleCallback(() => {
    const stopsByDistance = Object.entries(stopsByName).reduce<
      Record<string, { stops: StopV1[] }[]>
    >((acc, [name, stops]) => {
      const grouped = [] as { stops: StopV1[] }[];

      for (const stop of stops) {
        if (activeStopIds.size > 0 && !activeStopIds.has(stop.id)) {
          continue;
        }

        const closeEnough = grouped.find((x) => areaOf([stop, ...x.stops]) < 1e-7);

        if (closeEnough) {
          closeEnough.stops.push(stop);
          continue;
        }

        grouped.push({ stops: [stop] });
      }

      acc[name] = grouped;
      return acc;
    }, {});

    requestIdleCallback(() => {
      const result = Object.values(stopsByDistance)
        .flatMap((x) => x.map((y) => y.stops))
        .map((a) => {
          const name = a[0]!.name;
          const avgLat = a.reduce((acc, stop) => acc + stop.lat, 0) / a.length;
          const avgLng = a.reduce((acc, stop) => acc + stop.lng, 0) / a.length;
          const ids = a.map((stop) => stop.id);
          return { name, lat: avgLat, lng: avgLng, ids } satisfies GroupedStop;
        });

      stopsGroupedSignal.value = result;

      if (!followingVehicleIdSignal.value && followingStopIdsSignal.value.length === 0) {
        displayedStopsSignal.value = result;
      }
    });
  });
}

export function processMessage(message: V1Message) {
  if (typeof message.d === "object" && "vehicles" in message.d) {
    const vehicles = message.d.vehicles.map((v) => VehicleV1.fromSimple(v));
    const locationPairs: VehicleLocationPair[] = [];

    let minLat = 89.5;
    let maxLat = -89.5;
    let minLng = 89.5;
    let maxLng = -89.5;

    const newMap = new Map<string, VehicleV1>();

    for (const v of vehicles) {
      if (v.prevLat != null && v.prevLng != null) {
        locationPairs.push({
          from: [v.prevLng, v.prevLat],
          to: [v.lng, v.lat],
          color: Number(v.routeId) >= 100 ? "#00f" : "#f00",
        });
      }

      minLat = Math.min(minLat, v.lat);
      maxLat = Math.max(maxLat, v.lat);
      minLng = Math.min(minLng, v.lng);
      maxLng = Math.max(maxLng, v.lng);

      newMap.set(v.getMapId(), v);
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

  if (typeof message.d === "object" && "activeStops" in message.d) {
    const newActiveStopIds = new Set(message.d.activeStops);
    const currentIds = activeStopIdsSignal.value;
    const diff = new Set([...newActiveStopIds].filter((id) => !currentIds.has(id)));
    if (diff.size > 0) {
      activeStopIdsSignal.value = newActiveStopIds;
      computeGroupedStops();
    }
  }

  if (typeof message.d === "object" && "simpleStops" in message.d) {
    const stops = (message.d.simpleStops as (string | number)[][]).map((s) => StopV1.fromSimple(s));
    console.log("Updating stops");

    let minLat = 89.5;
    let maxLat = -89.5;
    let minLng = 89.5;
    let maxLng = -89.5;
    for (const stop of stops) {
      minLat = Math.min(minLat, stop.lat);
      maxLat = Math.max(maxLat, stop.lat);
      minLng = Math.min(minLng, stop.lng);
      maxLng = Math.max(maxLng, stop.lng);
    }

    batch(() => {
      stopBoundsSignal.value = [
        [minLng, minLat],
        [maxLng, maxLat],
      ];
      simpleStopsSignal.value = Object.fromEntries(stops.map((stop) => [stop.id, stop]));
      updateMaxBounds();
    });

    computeGroupedStops();
  }
}

let followingRouteAbort: AbortController | null = null;
let followingRouteRefreshAbort: AbortController | null = null;

export async function fetchFollowingRoute(tripId: string) {
  followingRouteAbort?.abort();
  followingRouteRefreshAbort?.abort();
  followingRouteAbort = new AbortController();
  const { signal } = followingRouteAbort;

  const shape = (await fetch(`${API_URL}/v1/schedule/trip-info/${tripId}`, { signal })
    .then((x) => x.json())
    .catch(() => null)) as {
    d: {
      stopIds: string[];
      route: [number, number][];
      stopTimes: {
        stopId: string;
        stopSequence: number;
        stopName: string;
        arrivalTime: number | null;
      }[];
    };
  } | null;

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
    if (s.arrivalTime != null) {
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

  const shape = (await fetch(`${API_URL}/v1/schedule/trip-info/${tripId}`, { signal })
    .then((x) => x.json())
    .catch(() => null)) as {
    d: {
      stopTimes: {
        stopId: string;
        arrivalTime: number | null;
      }[];
    };
  } | null;

  if (signal.aborted) return;

  if (!shape) return;

  const map = new Map<string, number>();
  for (const s of shape.d.stopTimes) {
    if (s.arrivalTime != null) {
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
  const res = (await fetch(`${API_URL}/v1/schedule/stop-trips?${queryParams.toString()}`, {
    signal,
  })
    .then((x) => x.json())
    .catch(() => null)) as {
    d: {
      arrivalTimes: StopArrivalTime[];
    };
  } | null;

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
  const trips = (await fetch(`${API_URL}/v1/schedule/stop-trips?${queryParams.toString()}`, {
    signal,
  })
    .then((x) => x.json())
    .catch(() => null)) as {
    d: {
      stopTrips: string[];
      arrivalTimes: StopArrivalTime[];
    };
  } | null;

  if (signal.aborted) return null;

  stopArrivalTimesSignal.value = trips?.d.arrivalTimes ?? null;

  return trips?.d.stopTrips ?? null;
}
