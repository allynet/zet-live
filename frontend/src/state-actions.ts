import { useStore } from "@/store";
import { fetchFollowingRoute, fetchStopTrips } from "@/hooks/use-stops";

export function selectVehicle(rawVehicleId: string, tripId: string, flyTo = false) {
  useStore.setState({
    followingStopIds: [],
    selectedStop: null,
    stopArrivalTimes: null,
    followingTripIds: null,
    tripFetchError: null,
    stopFetchError: null,
  });

  const mapId = `vehicle-${rawVehicleId}`;

  useStore.setState({
    followingVehicleId: mapId,
    followingTripId: tripId,
    followEnabled: false,
  });

  if (flyTo) {
    const vehicle = useStore.getState().vehicles.get(mapId);
    if (vehicle) {
      useStore.setState({ flyToTarget: { longitude: vehicle.lng, latitude: vehicle.lat } });
    }
  }

  if (tripId) {
    void fetchFollowingRoute(tripId);
  }
}

export function selectStop(stopIds: string[]) {
  const state = useStore.getState();

  useStore.setState({
    followingVehicleId: null,
    followEnabled: false,
    followingTripId: null,
    followingRoute: null,
    tripStopTimes: null,
    followingStopIds: stopIds,
    tripFetchError: null,
    stopFetchError: null,
  });

  const simpleStops = state.simpleStops;
  const stopName = stopIds.map((id) => simpleStops[id]?.name).find(Boolean) ?? "Unknown stop";

  useStore.setState({
    selectedStop: { name: stopName, ids: stopIds, routes: [] },
  });

  const stops = stopIds
    .map((id) => simpleStops[id])
    .filter(Boolean)
    .map((stop) => ({ name: stop.name, lat: stop.lat, lng: stop.lng, ids: [stop.id] }));
  useStore.setState({ displayedStops: stops });

  void fetchStopTrips(stopIds).then((tripIds) => {
    if (!tripIds) return;

    useStore.setState({ followingTripIds: new Set(tripIds) });

    const vehicles = useStore.getState().vehicles;
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

    useStore.setState({
      selectedStop: { name: stopName, ids: stopIds, routes: sorted },
    });
  });
}

export function clearSelection() {
  const { stopsGrouped } = useStore.getState();
  useStore.setState({
    followingVehicleId: null,
    followEnabled: false,
    followingStopIds: [],
    followingTripId: null,
    followingTripIds: null,
    followingRoute: null,
    selectedStop: null,
    displayedStops: stopsGrouped,
    tripStopTimes: null,
    stopArrivalTimes: null,
    tripFetchError: null,
    stopFetchError: null,
  });
}
