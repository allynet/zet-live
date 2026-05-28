import { useRef, useEffect, useCallback } from "preact/hooks";
import { useSignalEffect, effect } from "@preact/signals";
import {
  followingVehicleIdSignal,
  followEnabledSignal,
  followingTripIdSignal,
  followingStopIdsSignal,
  simpleStopsSignal,
} from "@/state";
import { selectVehicle, selectStop, clearSelection } from "@/state-actions";

const DEBOUNCE_MS = 300;

function buildUrlParams(): string {
  const params = new URLSearchParams();

  const vehicleMapId = followingVehicleIdSignal.value;
  const tripId = followingTripIdSignal.value;
  const stopIds = followingStopIdsSignal.value;

  if (vehicleMapId) {
    const rawId = vehicleMapId.replace(/^vehicle-/, "");
    params.set("vehicle", rawId);
    if (tripId) params.set("trip", tripId);
    if (followEnabledSignal.value) params.set("follow", "1");
  } else if (stopIds.length > 0) {
    for (const id of stopIds) {
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
      followEnabledSignal.value = true;
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

  useSignalEffect(() => {
    const _v = followingVehicleIdSignal.value;
    const _t = followingTripIdSignal.value;
    const _s = followingStopIdsSignal.value;
    const _f = followEnabledSignal.value;
    void _v;
    void _t;
    void _s;
    void _f;

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
  });

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const vehicleParam = params.get("vehicle");
    const tripParam = params.get("trip");
    const stopParams = params.getAll("stop");

    if (vehicleParam) {
      const follow = params.get("follow") === "1";
      const dispose = effect(() => {
        if (Object.keys(simpleStopsSignal.value).length === 0) return;
        isRestoringRef.current = true;
        selectVehicle(vehicleParam, tripParam ?? "");
        if (follow) {
          followEnabledSignal.value = true;
        }
        isRestoringRef.current = false;
        dispose();
      });
    } else if (stopParams.length > 0) {
      const dispose = effect(() => {
        if (Object.keys(simpleStopsSignal.value).length === 0) return;
        isRestoringRef.current = true;
        selectStop(stopParams);
        isRestoringRef.current = false;
        dispose();
      });
    }

    initializedRef.current = true;
  }, []);
}
