import { useRef, useEffect, useCallback } from "react";
import { useStore } from "@/store";
import { selectVehicle, selectStop, clearSelection } from "@/state-actions";

const DEBOUNCE_MS = 300;

function buildUrlParams(): string {
  const { followingVehicleId, followingTripId, followingStopIds, followEnabled } =
    useStore.getState();
  const params = new URLSearchParams();

  if (followingVehicleId) {
    const rawId = followingVehicleId.replace(/^vehicle-/, "");
    params.set("vehicle", rawId);
    if (followingTripId) params.set("trip", followingTripId);
    if (followEnabled) params.set("follow", "1");
  } else if (followingStopIds.length > 0) {
    for (const id of followingStopIds) {
      params.append("stop", id);
    }
  }

  return params.toString();
}

function applyUrlParams(params: URLSearchParams) {
  const vehicleParam = params.get("vehicle");
  const tripParam = params.get("trip");
  const followParam = params.get("follow");
  const stopParams = params.getAll("stop");

  if (vehicleParam) {
    selectVehicle(vehicleParam, tripParam ?? "");
    if (followParam === "1") {
      useStore.setState({ followEnabled: true });
    }
  } else if (stopParams.length > 0) {
    selectStop(stopParams);
  } else {
    clearSelection();
  }
}

export function useUrlSync() {
  const isRestoringRef = useRef(false);
  const initializedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const followingVehicleId = useStore((s) => s.followingVehicleId);
  const followingTripId = useStore((s) => s.followingTripId);
  const followingStopIds = useStore((s) => s.followingStopIds);
  const followEnabled = useStore((s) => s.followEnabled);

  const syncUrl = useCallback((push: boolean) => {
    const newSearch = buildUrlParams();
    const targetPath = newSearch
      ? `${location.pathname}?${newSearch}${location.hash}`
      : `${location.pathname}${location.hash}`;
    if (push) {
      history.pushState(null, "", targetPath);
    } else {
      history.replaceState(null, "", targetPath);
    }
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (isRestoringRef.current) return;

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    syncUrl(false);

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      syncUrl(true);
    }, DEBOUNCE_MS);
  }, [followingVehicleId, followingTripId, followingStopIds, followEnabled, syncUrl]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handlePopState = useCallback(() => {
    isRestoringRef.current = true;
    applyUrlParams(new URLSearchParams(location.search));
    isRestoringRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [handlePopState]);

  const simpleStops = useStore((s) => s.simpleStops);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const vehicleParam = params.get("vehicle");
    const tripParam = params.get("trip");
    const stopParams = params.getAll("stop");

    if (vehicleParam) {
      const follow = params.get("follow") === "1";
      if (Object.keys(simpleStops).length > 0) {
        isRestoringRef.current = true;
        selectVehicle(vehicleParam, tripParam ?? "");
        if (follow) {
          useStore.setState({ followEnabled: true });
        }
        isRestoringRef.current = false;
      }
    } else if (stopParams.length > 0) {
      if (Object.keys(simpleStops).length > 0) {
        isRestoringRef.current = true;
        selectStop(stopParams);
        isRestoringRef.current = false;
      }
    }

    initializedRef.current = true;
  }, [simpleStops]);
}
