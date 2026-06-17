import { useEffect } from "react";
import { useStore } from "@/store";
import { fetchFollowingRoute, fetchStopTrips } from "@/hooks/use-stops";

/**
 * Reactively fetches the data needed for the current selection.
 * Selecting a vehicle/stop on the store triggers the appropriate fetch here,
 * keeping the store free of API-layer imports.
 */
export function useSelectionFetcher() {
  useEffect(() => {
    const unsubscribe = useStore.subscribe(
      (s) => s.selection,
      (selection) => {
        if (!selection) return;
        switch (selection.type) {
          case "vehicle":
            if (selection.tripId) void fetchFollowingRoute(selection.tripId);
            break;
          case "stop":
            void fetchStopTrips(selection.ids);
            break;
          case "gbfs-station":
            break;
        }
      },
    );
    return unsubscribe;
  }, []);
}
