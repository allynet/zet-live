import type { StopV1 } from "@/app/entity/v1/stop";
import type { GroupedStop } from "@/app/entity/shared";

export type TripStopTimeEntry = {
  stopId: string;
  stopSequence: number;
  arrivalTime: number | null;
};

export type RouteDisplayedStop = GroupedStop & {
  stopSequence: number;
};

export function buildRouteDisplayedStops(
  tripStopTimes: TripStopTimeEntry[],
  simpleStops: Record<string, StopV1>,
): RouteDisplayedStop[] {
  const result: RouteDisplayedStop[] = [];

  for (const st of tripStopTimes) {
    const stop = simpleStops[st.stopId];
    if (!stop) continue;

    result.push({
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      ids: [st.stopId],
      stopSequence: st.stopSequence,
    });
  }

  return result;
}

export function findNextStopIndex(
  displayedStops: { stopSequence?: number; ids: string[] }[],
  nextStopSequence: number | null,
  nextStopId: string | null,
): number {
  if (nextStopSequence !== null) {
    const idx = displayedStops.findIndex((s) => s.stopSequence === nextStopSequence);
    if (idx >= 0) return idx;

    const fallback = displayedStops.findIndex(
      (s) => s.stopSequence !== undefined && s.stopSequence > nextStopSequence,
    );
    if (fallback >= 0) return fallback;
  }

  if (nextStopId) {
    return displayedStops.findIndex((s) => s.ids.includes(nextStopId));
  }

  return -1;
}

export function buildArrivalTimeLookup(
  tripStopTimes: TripStopTimeEntry[] | null,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const st of tripStopTimes ?? []) {
    if (st.arrivalTime !== null) {
      m.set(`${st.stopId}:${st.stopSequence}`, st.arrivalTime);
    }
  }
  return m;
}

export function lookupStopArrivalTime(
  lookup: Map<string, number>,
  stopIds: string[],
  stopSequence: number | undefined,
): number | null {
  if (stopSequence === undefined) return null;

  for (const stopId of stopIds) {
    const time = lookup.get(`${stopId}:${stopSequence}`);
    if (time !== undefined) return time;
  }

  return null;
}

export function patchTripStopTimesFromVehicle(
  tripStopTimes: TripStopTimeEntry[] | null,
  nextStopSequence: number | null,
  nextStopArrivalTime: number | null,
): TripStopTimeEntry[] | null {
  if (!tripStopTimes || nextStopSequence === null || nextStopArrivalTime === null) {
    return tripStopTimes;
  }

  const existingIdx = tripStopTimes.findIndex((s) => s.stopSequence === nextStopSequence);
  if (existingIdx < 0) {
    return tripStopTimes;
  }
  const existing = tripStopTimes[existingIdx]!;
  if (existing.arrivalTime === nextStopArrivalTime) {
    return tripStopTimes;
  }

  const newStopTimes = tripStopTimes.slice();
  newStopTimes[existingIdx] = { ...existing, arrivalTime: nextStopArrivalTime };

  return newStopTimes;
}
