import { MapContainer } from "@/components/map-container";
import { BottomSheet } from "@/components/bottom-sheet";
import { StopSheet } from "@/components/stop-sheet";
import { VehicleSheet } from "@/components/vehicle-sheet";
import { StatusBar } from "@/components/status-bar";
import { SearchBar } from "@/components/search-bar";
import { LoadingScreen } from "@/components/loading-screen";
import { Toaster } from "sonner";
import { useWebSocket } from "@/hooks/use-websocket";
import { useUrlSync } from "@/hooks/use-url-sync";
import { useVersionCheck } from "@/hooks/use-version-check";
import { useTheme } from "@/hooks/use-theme";
import { useStore } from "@/store";
import { findNextStopIndex } from "@/app/trip-stop-times";
import { selectVehicle, selectStop, clearSelection } from "@/state-actions";
import type { ReactNode } from "react";
import { SettingsButton, SettingsModal } from "./components/settings-modal";
import { NoticeBar } from "./components/notice-bar";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useSetting } from "./settings";

export function App() {
  useWebSocket();
  useUrlSync();
  useVersionCheck();
  useTheme();

  const wakeLockEnabled = useSetting("wakeLockEnabled");
  useWakeLock(wakeLockEnabled);

  const selectedStop = useStore((s) => s.selectedStop);
  const selectedVehicle = useStore((s) =>
    s.followingVehicleId ? (s.vehicles.get(s.followingVehicleId) ?? null) : null,
  );
  const displayedStops = useStore((s) => s.displayedStops);
  const tripStopTimes = useStore((s) => s.tripStopTimes);
  const stopArrivalTimes = useStore((s) => s.stopArrivalTimes);
  const followEnabled = useStore((s) => s.followEnabled);
  const tripFetchError = useStore((s) => s.tripFetchError);

  const nextStopIndex = selectedVehicle
    ? findNextStopIndex(
        displayedStops,
        selectedVehicle.nextStopSequence,
        selectedVehicle.nextStopId,
      )
    : -1;

  const isOpen = selectedVehicle !== null || selectedStop !== null;

  let sheetTitle: ReactNode = null;
  let minimizedBody: ReactNode | undefined;

  if (selectedVehicle) {
    const routeTitle = selectedVehicle.getDisplayName();
    const isBus = selectedVehicle.routeId.length > 2;
    sheetTitle = (
      <div className="flex items-center gap-2">
        <span
          className={`text-on-primary inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${isBus ? "bg-primary" : "bg-danger"}`}
        >
          {selectedVehicle.routeId}
        </span>
        <span className="text-on-surface text-sm font-bold">{routeTitle}</span>
      </div>
    );

    if (selectedVehicle.nextStopArrivalTime !== null) {
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
        <span className="text-on-surface-muted text-xs">
          Next stop{stopLabel} arriving {timeLabel}
        </span>
      );
    }
  } else if (selectedStop) {
    sheetTitle = (
      <span className="text-on-surface truncate text-sm font-bold">{selectedStop.name}</span>
    );

    const firstArrival = stopArrivalTimes?.find((a) => a.arrivalTime !== null);
    if (firstArrival) {
      const secondsUntil = (firstArrival.arrivalTime!.getTime() - Date.now()) / 1000;
      const minutes = Math.round(secondsUntil / 60);
      const label = minutes <= 0 ? "now" : minutes === 1 ? "1 min" : `${minutes} min`;
      minimizedBody = (
        <span className="text-on-surface-muted text-xs">
          Route {firstArrival.routeId} in {label}
        </span>
      );
    }
  }

  return (
    <>
      <LoadingScreen />
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
            tripFetchError={tripFetchError}
            followEnabled={followEnabled}
            onToggleFollow={() => {
              useStore.setState({ followEnabled: !useStore.getState().followEnabled });
            }}
            onLocate={() => {
              if (selectedVehicle) {
                useStore.setState({
                  flyToTarget: {
                    longitude: selectedVehicle.lng,
                    latitude: selectedVehicle.lat,
                  },
                });
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

      <div className="pointer-events-none absolute top-2 right-12 left-2 z-1000 grid grid-cols-[minmax(0,auto)_1fr] gap-2 *:pointer-events-auto">
        <div className="flex flex-col gap-2">
          <SettingsButton />
          <div className="h-4">
            <div className="absolute ml-1.5">
              <StatusBar />
            </div>
          </div>
        </div>

        <div className="w-full max-w-md">
          <SearchBar />
        </div>

        <div className="pointer-events-none col-span-2">
          <NoticeBar />
        </div>
      </div>

      <Toaster position="top-center" />
      <SettingsModal />
    </>
  );
}
