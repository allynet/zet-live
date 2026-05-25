import {
  followingVehicleIdSignal,
  followEnabledSignal,
  followingStopIdsSignal,
  followingTripIdSignal,
  followingTripIdsSignal,
  followingRouteSignal,
  selectedStopSignal,
  displayedStopsSignal,
  stopsGroupedSignal,
  tripStopTimesSignal,
  stopArrivalTimesSignal,
  vehiclesSignal,
  simpleStopsSignal,
  flyToTargetSignal,
} from "@/state";
import { fetchFollowingRoute, fetchStopTrips } from "@/hooks/use-stops";

export function selectVehicle(rawVehicleId: string, tripId: string, flyTo = false) {
  followingStopIdsSignal.value = [];
  selectedStopSignal.value = null;
  stopArrivalTimesSignal.value = null;
  followingTripIdsSignal.value = null;

  const mapId = `vehicle-${rawVehicleId}`;
  followingVehicleIdSignal.value = mapId;
  followingTripIdSignal.value = tripId;
  followEnabledSignal.value = false;

  if (flyTo) {
    const vehicle = vehiclesSignal.value.get(mapId);
    if (vehicle) {
      flyToTargetSignal.value = { longitude: vehicle.lng, latitude: vehicle.lat };
    }
  }

  if (tripId) {
    void fetchFollowingRoute(tripId);
  }
}

export function selectStop(stopIds: string[]) {
  followingVehicleIdSignal.value = null;
  followEnabledSignal.value = false;
  followingTripIdSignal.value = null;
  followingRouteSignal.value = null;
  tripStopTimesSignal.value = null;

  followingStopIdsSignal.value = stopIds;

  const simpleStops = simpleStopsSignal.value;
  const stopName = stopIds.map((id) => simpleStops[id]?.name).find(Boolean) ?? "Unknown stop";

  selectedStopSignal.value = { name: stopName, ids: stopIds, routes: [] };

  const stops = stopIds
    .map((id) => simpleStops[id])
    .filter(Boolean)
    .map((stop) => ({ name: stop.name, lat: stop.lat, lng: stop.lng, ids: [stop.id] }));
  displayedStopsSignal.value = stops;

  void fetchStopTrips(stopIds).then((tripIds) => {
    if (!tripIds) return;
    followingTripIdsSignal.value = new Set(tripIds);

    const vehicles = vehiclesSignal.value;
    const routes = new Set<string>();
    for (const v of vehicles.values()) {
      if (tripIds.includes(v.tripId)) {
        routes.add(v.routeId);
      }
    }
    const sorted = Array.from(routes).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    selectedStopSignal.value = { name: stopName, ids: stopIds, routes: sorted };
  });
}

export function clearSelection() {
  followingVehicleIdSignal.value = null;
  followEnabledSignal.value = false;
  followingStopIdsSignal.value = [];
  followingTripIdSignal.value = null;
  followingTripIdsSignal.value = null;
  followingRouteSignal.value = null;
  selectedStopSignal.value = null;
  displayedStopsSignal.value = stopsGroupedSignal.value;
  tripStopTimesSignal.value = null;
  stopArrivalTimesSignal.value = null;
}
