import type { StopArrivalTime } from "@/store";

function formatMinutesFromNow(arrivalTime: number): string {
  const secondsUntil = arrivalTime - Date.now() / 1000;
  const minutes = Math.round(secondsUntil / 60);
  if (minutes <= 0) return "now";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

type Props = {
  stop: { name: string; ids: string[]; routes: string[] };
  arrivals: StopArrivalTime[] | null;
  onArrivalClick: (vehicleId: string, tripId: string) => void;
};

export function StopSheet({ arrivals, onArrivalClick }: Props) {
  const grouped = new Map<string, StopArrivalTime[]>();
  for (const a of arrivals ?? []) {
    const list = grouped.get(a.routeId) ?? [];
    list.push(a);
    grouped.set(a.routeId, list);
  }

  for (const [, list] of grouped) {
    list.sort((a, b) => {
      if (a.arrivalTime === null && b.arrivalTime === null) return 0;
      if (a.arrivalTime === null) return 1;
      if (b.arrivalTime === null) return -1;
      return a.arrivalTime - b.arrivalTime;
    });
  }

  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) => {
    const aMin = a.find((x) => x.arrivalTime !== null)?.arrivalTime ?? Infinity;
    const bMin = b.find((x) => x.arrivalTime !== null)?.arrivalTime ?? Infinity;
    return aMin - bMin;
  });

  return (
    <div className="px-4 pb-3">
      <div className="space-y-1">
        {arrivals === null ? (
          <span className="text-on-surface-faint text-xs italic">Loading arrivals...</span>
        ) : sortedGroups.length === 0 ? (
          <span className="text-on-surface-faint text-xs italic">No active vehicles</span>
        ) : (
          sortedGroups.map(([routeId, times]) => {
            const isBus = routeId.length > 2;
            return (
              <div key={routeId} className="flex items-center gap-2">
                <span
                  className={`text-on-primary inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-bold ${isBus ? "bg-primary" : "bg-danger"}`}
                >
                  {routeId}
                </span>
                <div className="flex flex-wrap gap-1">
                  {times.map((t) =>
                    t.arrivalTime !== null ? (
                      <span
                        key={t.vehicleId}
                        className="bg-surface-dim text-on-surface-variant active:bg-surface-hover cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium"
                        onClick={() => {
                          onArrivalClick(t.vehicleId, t.tripId);
                        }}
                      >
                        {formatMinutesFromNow(t.arrivalTime)}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
