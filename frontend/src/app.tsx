import { MapContainer } from "@/components/map-container";
import { BottomSheet } from "@/components/bottom-sheet";
import { StopSheet } from "@/components/stop-sheet";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { StatusBar } from "@/components/status-bar";
import { Toaster } from "sonner";
import { useWebSocket } from "@/hooks/use-websocket";
import { useStops } from "@/hooks/use-stops";
import { useSignalState } from "@/hooks/use-signal-state";
import { useUrlSync } from "@/hooks/use-url-sync";
import {
  selectedStopSignal,
  vehiclesSignal,
  followingVehicleIdSignal,
  followEnabledSignal,
  flyToTargetSignal,
  displayedStopsSignal,
  tripStopTimesSignal,
  stopArrivalTimesSignal,
} from "@/state";
import { selectVehicle, selectStop, clearSelection } from "@/state-actions";
import type { ComponentChildren } from "preact";

export function App() {
  useWebSocket();
  useStops();
  useUrlSync();

  const followingVehicleId = useSignalState(followingVehicleIdSignal);
  const vehicles = useSignalState(vehiclesSignal);
  const selectedStop = useSignalState(selectedStopSignal);
  const displayedStops = useSignalState(displayedStopsSignal);
  const tripStopTimes = useSignalState(tripStopTimesSignal);
  const stopArrivalTimes = useSignalState(stopArrivalTimesSignal);
  const followEnabled = useSignalState(followEnabledSignal);

  const selectedVehicle = followingVehicleId ? (vehicles.get(followingVehicleId) ?? null) : null;

  const nextStopIndex = selectedVehicle?.nextStopId
    ? displayedStops.findIndex((stop) => stop.ids.includes(selectedVehicle.nextStopId!))
    : -1;

  const isOpen = selectedVehicle !== null || selectedStop !== null;

  let sheetTitle: ComponentChildren = null;
  let minimizedBody: ComponentChildren | undefined;

  if (selectedVehicle) {
    sheetTitle = (
      <div class="flex items-center gap-2">
        <span
          class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold text-white"
          style={{
            backgroundColor: selectedVehicle.routeId.length > 2 ? "#2563eb" : "#dc2626",
          }}
        >
          {selectedVehicle.routeId}
        </span>
        <span class="text-sm font-bold text-gray-900">Route {selectedVehicle.routeId}</span>
      </div>
    );

    if (selectedVehicle.nextStopArrivalTime != null) {
      const untilDate = new Date(selectedVehicle.nextStopArrivalTime * 1000);
      const secondsUntil = selectedVehicle.nextStopArrivalTime - Date.now() / 1000;
      const minutes = Math.round(secondsUntil / 60);
      const minutesStr = minutes <= 0 ? null : minutes === 1 ? "1 min" : `${minutes} min`;
      const stopName = selectedVehicle.nextStopId
        ? displayedStops.find((s) => s.ids.includes(selectedVehicle.nextStopId!))?.name
        : null;

      const stopLabel = stopName ? (
        <>
          {" "}
          is <strong>{stopName}</strong>
        </>
      ) : (
        ""
      );
      const timeLabel = minutesStr ? (
        <>
          in{" "}
          <strong>
            <time dateTime={untilDate.toISOString()} title={untilDate.toLocaleString()}>
              {minutesStr}
            </time>
          </strong>
        </>
      ) : (
        <strong>now</strong>
      );

      minimizedBody = (
        <span class="text-xs text-gray-500">
          Next stop{stopLabel} arriving {timeLabel}
        </span>
      );
    }
  } else if (selectedStop) {
    sheetTitle = <span class="truncate text-sm font-bold text-gray-900">{selectedStop.name}</span>;

    const firstArrival = stopArrivalTimes?.find((a) => a.arrivalTime != null);
    if (firstArrival) {
      const secondsUntil = firstArrival.arrivalTime! - Date.now() / 1000;
      const minutes = Math.round(secondsUntil / 60);
      const label = minutes <= 0 ? "now" : minutes === 1 ? "1 min" : `${minutes} min`;
      minimizedBody = (
        <span class="text-xs text-gray-500">
          Route {firstArrival.routeId} in {label}
        </span>
      );
    }
  }

  return (
    <>
      <MapContainer />
      <BottomSheet
        open={isOpen}
        title={sheetTitle}
        onClose={clearSelection}
        minimizedBody={minimizedBody}
      >
        {selectedVehicle ? (
          <VehicleSheet
            vehicle={selectedVehicle}
            displayedStops={displayedStops}
            nextStopIndex={nextStopIndex}
            tripStopTimes={tripStopTimes}
            followEnabled={followEnabled}
            onToggleFollow={() => {
              followEnabledSignal.value = !followEnabledSignal.value;
            }}
            onLocate={() => {
              if (selectedVehicle) {
                flyToTargetSignal.value = {
                  longitude: selectedVehicle.lng,
                  latitude: selectedVehicle.lat,
                };
              }
            }}
            onStopClick={selectStop}
          />
        ) : selectedStop ? (
          <StopSheet
            stop={selectedStop}
            arrivals={stopArrivalTimes}
            onArrivalClick={(vehicleId, tripId) => {
              selectVehicle(vehicleId, tripId, true);
            }}
          />
        ) : null}
      </BottomSheet>
      <StatusBar />
      <Toaster position="top-center" />
    </>
  );
}
