import { MapContainer } from "@/components/map-container";
import { BottomSheet } from "@/components/bottom-sheet";
import { StopSheet } from "@/components/stop-sheet";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { StatusBar } from "@/components/status-bar";
import { SearchBar } from "@/components/search-bar";
import { Toaster } from "sonner";
import { useWebSocket } from "@/hooks/use-websocket";
import { useSignalState } from "@/hooks/use-signal-state";
import { useUrlSync } from "@/hooks/use-url-sync";
import { useVersionCheck } from "@/hooks/use-version-check";
import {
  selectedStopSignal,
  selectedVehicleSignal,
  followEnabledSignal,
  flyToTargetSignal,
  displayedStopsSignal,
  tripStopTimesSignal,
  stopArrivalTimesSignal,
} from "@/state";
import { selectVehicle, selectStop, clearSelection } from "@/state-actions";
import type { ComponentChildren } from "preact";
import { MapStyleSwitcher } from "./components/map-style-switcher";

export function App() {
  useWebSocket();
  useUrlSync();
  useVersionCheck();

  const selectedStop = useSignalState(selectedStopSignal);
  const selectedVehicle = useSignalState(selectedVehicleSignal);
  const displayedStops = useSignalState(displayedStopsSignal);
  const tripStopTimes = useSignalState(tripStopTimesSignal);
  const stopArrivalTimes = useSignalState(stopArrivalTimesSignal);
  const followEnabled = useSignalState(followEnabledSignal);

  const nextStopIndex = selectedVehicle?.nextStopId
    ? displayedStops.findIndex((stop) => stop.ids.includes(selectedVehicle.nextStopId!))
    : -1;

  const isOpen = selectedVehicle !== null || selectedStop !== null;

  let sheetTitle: ComponentChildren = null;
  let minimizedBody: ComponentChildren | undefined;

  if (selectedVehicle) {
    const routeTitle = selectedVehicle.getDisplayName();
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
        <span class="text-sm font-bold text-gray-900">{routeTitle}</span>
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

      <div class="pointer-events-none absolute top-2 right-12 left-2 z-1000 grid grid-cols-[minmax(0,auto)_1fr] gap-2 [&>*]:pointer-events-auto">
        <div class="flex flex-col gap-2">
          <MapStyleSwitcher />
          <div>
            <div class="absolute ml-1.5">
              <StatusBar />
            </div>
          </div>
        </div>
        <div class="w-full max-w-md">
          <SearchBar />
        </div>
      </div>

      <Toaster position="top-center" />
    </>
  );
}
