import { useEffect, useState, useCallback } from "preact/hooks";
import {
  selectedStopSignal,
  vehiclesSignal,
  followingTripIdsSignal,
  followingStopIdsSignal,
  followingRouteSignal,
  displayedStopsSignal,
  stopsGroupedSignal,
} from "@/state";
import { useSignalState } from "@/hooks/use-signal-state";

export function StopCard() {
  const selected = useSignalState(selectedStopSignal);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (selected) {
      setRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
    } else {
      setVisible(false);
    }
  }, [selected]);

  useEffect(() => {
    if (!visible && rendered) {
      const id = setTimeout(() => {
        setRendered(false);
      }, 200);
      return () => {
        clearTimeout(id);
      };
    }
  }, [visible, rendered]);

  const dismiss = useCallback(() => {
    selectedStopSignal.value = null;
    followingStopIdsSignal.value = [];
    followingTripIdsSignal.value = null;
    followingRouteSignal.value = null;
    displayedStopsSignal.value = stopsGroupedSignal.value;
  }, []);

  const tripIds = useSignalState(followingTripIdsSignal);
  const vehicles = useSignalState(vehiclesSignal);

  const activeVehicles = tripIds
    ? Array.from(vehicles.values()).filter((v) => tripIds.has(v.tripId)).length
    : 0;

  if (!rendered) return null;

  return (
    <div class="pointer-events-none fixed right-0 bottom-0 left-0 z-[999] flex justify-center">
      <div
        class={`pointer-events-auto m-2 mb-0 w-full max-w-md rounded-t-xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-sm font-bold text-gray-900">{selected?.name}</h2>
            <div class="mt-1.5 flex flex-wrap gap-1">
              {selected && selected.routes.length > 0 ? (
                selected.routes.map((route) => (
                  <span
                    key={route}
                    class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{
                      backgroundColor: route.length > 2 ? "#2563eb" : "#dc2626",
                    }}
                  >
                    {route}
                  </span>
                ))
              ) : (
                <span class="text-xs text-gray-400 italic">Loading routes...</span>
              )}
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            {activeVehicles > 0 && (
              <span class="text-xs text-gray-500">{activeVehicles} active</span>
            )}
            <button
              type="button"
              onClick={dismiss}
              class="h-[150%] rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
