import type { V1Message } from "@/app/entity/v1/message";
import {
  apiFetch,
  tripInfoResponseSchema,
  tripStopTimesResponseSchema,
  stopArrivalsResponseSchema,
  stopTripsResponseSchema,
} from "@/app/entity/v1/api";
import { VehicleV1 } from "@/app/entity/v1/vehicle";
import { StopV1 } from "@/app/entity/v1/stop";
import { API_URL } from "@/app/consts";
import { useStore, type VehicleLocationPair, updateMaxBounds } from "@/store";
import type { StopsUpdateResponse } from "@/app/entity/shared";
import { buildRouteDisplayedStops, patchTripStopTimesFromVehicle } from "@/app/trip-stop-times";
import { toast } from "sonner";

export function handleStopsUpdate(response: StopsUpdateResponse) {
  if (response.stops) {
    const stops = response.stops.map((s) => new StopV1(s));

    useStore.setState({
      simpleStops: Object.fromEntries(stops.map((stop) => [stop.id, stop])),
      ...(response.bounds ? { stopBounds: response.bounds } : {}),
    });
    updateMaxBounds();

    console.log("Updating stops");
  }

  const state = useStore.getState();
  useStore.setState({
    stopsGrouped: response.grouped,
    displayedStops:
      !state.followingVehicleId && state.followingStopIds.length === 0
        ? response.grouped
        : state.displayedStops,
  });
}

export function processMessage(message: V1Message) {
  if (typeof message.d === "object" && "vehicles" in message.d) {
    const rawVehicles = message.d.vehicles;
    const currentMap = useStore.getState().vehicles;
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

    const state = useStore.getState();
    let tripStopTimes = state.tripStopTimes;

    if (state.followingTripId && state.followingVehicleId) {
      const vehicle = newMap.get(state.followingVehicleId);
      if (vehicle && vehicle.tripId === state.followingTripId) {
        tripStopTimes = patchTripStopTimesFromVehicle(
          tripStopTimes,
          vehicle.nextStopSequence,
          vehicle.nextStopArrivalTime,
        );
      }
    }

    useStore.setState({
      vehicles: newMap,
      vehicleBounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      deltaMoveLines: locationPairs,
      ...(tripStopTimes !== state.tripStopTimes ? { tripStopTimes } : {}),
    });
    updateMaxBounds();

    const now = Date.now();
    if (now - lastStopTimesRefresh >= STOP_TIMES_REFRESH_INTERVAL) {
      lastStopTimesRefresh = now;

      const { followingTripId, followingStopIds } = useStore.getState();

      if (followingTripId) {
        void refreshTripStopTimes(followingTripId);
      } else if (followingStopIds.length > 0) {
        void refreshStopArrivalTimes(followingStopIds);
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

  const result = await apiFetch(
    `${API_URL}/v1/schedule/trip-info/${tripId}`,
    tripInfoResponseSchema,
    { signal },
  );

  if (signal.aborted) return;

  if (result.error) {
    const { error } = result.error;
    const isNotFound = result.error.status === 404;

    if (!isNotFound) {
      toast.error("Failed to load trip info", { description: error });
    }

    const state = useStore.getState();
    const vehicle = state.followingVehicleId ? state.vehicles.get(state.followingVehicleId) : null;

    let fallbackStops: { name: string; lat: number; lng: number; ids: string[] }[] = [];

    if (vehicle?.nextStopId) {
      const stop = state.simpleStops[vehicle.nextStopId];
      if (stop) {
        fallbackStops = [{ name: stop.name, lat: stop.lat, lng: stop.lng, ids: [stop.id] }];
      }
    }

    useStore.setState({
      followingRoute: null,
      displayedStops: fallbackStops,
      tripStopTimes: null,
      tripFetchError: isNotFound
        ? "Could not find full stop list.\nThis is a temporary issue."
        : error,
    });
    return;
  }

  const shape = result.data;
  const simpleStops = useStore.getState().simpleStops;
  const tripStopTimes = shape.d.stopTimes;

  useStore.setState({
    followingRoute: shape.d.route,
    displayedStops: buildRouteDisplayedStops(tripStopTimes, simpleStops),
    tripStopTimes,
    tripFetchError: null,
  });
}

let stopTripsAbort: AbortController | null = null;
let stopTripsRefreshAbort: AbortController | null = null;

let lastStopTimesRefresh = 0;
const STOP_TIMES_REFRESH_INTERVAL = 15_000;

async function refreshTripStopTimes(tripId: string) {
  followingRouteRefreshAbort?.abort();
  followingRouteRefreshAbort = new AbortController();
  const { signal } = followingRouteRefreshAbort;

  const result = await apiFetch(
    `${API_URL}/v1/schedule/trip-info/${tripId}`,
    tripStopTimesResponseSchema,
    { signal },
  );

  if (signal.aborted) return;

  if (result.error) {
    if (result.error.status !== 404) {
      console.error("Failed to refresh trip stop times:", result.error.error);
    }
    return;
  }

  useStore.setState({ tripStopTimes: result.data.d.stopTimes });
}

async function refreshStopArrivalTimes(stopIds: string[]) {
  stopTripsRefreshAbort?.abort();
  stopTripsRefreshAbort = new AbortController();
  const { signal } = stopTripsRefreshAbort;

  const queryParams = new URLSearchParams();
  for (const stopId of stopIds) {
    queryParams.append("stop", stopId);
  }

  const result = await apiFetch(
    `${API_URL}/v1/schedule/stop-trips?${queryParams.toString()}`,
    stopArrivalsResponseSchema,
    { signal },
  );

  if (signal.aborted) return;

  if (result.error) {
    if (result.error.status === 404) {
      useStore.setState({ stopFetchError: result.error.error });
    } else {
      toast.error("Failed to refresh arrivals", { description: result.error.error });
    }
    return;
  }

  useStore.setState({ stopArrivalTimes: result.data.d.arrivalTimes, stopFetchError: null });
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

  const result = await apiFetch(
    `${API_URL}/v1/schedule/stop-trips?${queryParams.toString()}`,
    stopTripsResponseSchema,
    { signal },
  );

  if (signal.aborted) return null;

  if (result.error) {
    if (result.error.status === 404) {
      useStore.setState({ stopFetchError: result.error.error });
    } else {
      toast.error("Failed to load stop trips", { description: result.error.error });
    }
    return null;
  }

  useStore.setState({
    stopArrivalTimes: result.data.d.arrivalTimes,
    stopFetchError: null,
  });

  return result.data.d.stopTrips;
}
