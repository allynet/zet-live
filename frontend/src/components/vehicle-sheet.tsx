import { useEffect } from "react";
import { toast } from "sonner";
import type { VehicleV1 } from "@/app/entity/v1/vehicle";
import {
  requestIdleCallback,
  requestAnimationFrame,
  cancelAnimationOrIdleCallback,
} from "@/utils/polyfill/requestSomeCallback";

function formatMinutesFromNow(arrivalTime: number): string {
  const secondsUntil = arrivalTime - Date.now() / 1000;
  const minutes = Math.round(secondsUntil / 60);
  if (minutes <= 0) return "now";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

type Props = {
  vehicle: VehicleV1;
  displayedStops: { name: string; ids: string[] }[];
  nextStopIndex: number;
  tripStopTimes: Map<string, number> | null;
  followEnabled: boolean;
  onToggleFollow: () => void;
  onLocate: () => void;
  onStopClick: (stopIds: string[]) => void;
};

export function VehicleSheet({
  vehicle,
  displayedStops,
  nextStopIndex,
  tripStopTimes,
  followEnabled,
  onToggleFollow,
  onLocate,
  onStopClick,
}: Props) {
  const arrivalLabel = vehicle.nextStopArrivalTime
    ? (() => {
        const secondsUntil = vehicle.nextStopArrivalTime - Date.now() / 1000;
        const minutes = Math.round(secondsUntil / 60);
        if (minutes <= 0) return "now";
        if (minutes === 1) return "1 min";
        return `${minutes} min`;
      })()
    : null;

  useEffect(() => {
    let timeout = requestIdleCallback(() => {
      timeout = requestAnimationFrame(() => {
        const $el = document.querySelector<HTMLElement>(
          `.bottom-vehicle-stop-list [data-is-next="true"]`,
        );
        if (!$el) {
          return;
        }
        $el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });

    return () => {
      cancelAnimationOrIdleCallback(timeout);
    };
  }, [vehicle.id]);

  return (
    <div className="flex max-h-full flex-col">
      <div className="max-h-full overflow-y-auto px-4 pb-3">
        <ul className="bottom-vehicle-stop-list space-y-0.5">
          {displayedStops.map((stop, i) => {
            const isNext = i === nextStopIndex;
            const isPassed = nextStopIndex >= 0 && i < nextStopIndex;
            const isUpcoming = nextStopIndex >= 0 && i > nextStopIndex;

            const stopArrivalTime = tripStopTimes
              ? (stop.ids.map((id) => tripStopTimes.get(id)).find((t) => t != null) ?? null)
              : null;
            const stopArrivalDate = stopArrivalTime ? new Date(stopArrivalTime * 1000) : null;

            const showBadge = isNext
              ? arrivalLabel !== null
              : isUpcoming && stopArrivalTime !== null;

            const badgeText = isNext
              ? arrivalLabel
              : stopArrivalTime != null
                ? formatMinutesFromNow(stopArrivalTime)
                : null;

            return (
              <li
                key={`${stop.name}-${i}`}
                data-is-next={isNext ? "true" : undefined}
                className={`hover:bg-surface-hover flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors duration-300 hover:transition-none ${
                  isNext
                    ? "bg-primary-container text-on-primary-container font-bold"
                    : isPassed
                      ? "text-on-surface-faint"
                      : "text-on-surface-variant"
                }`}
                onClick={() => {
                  onStopClick(stop.ids);
                }}
              >
                <span className="flex shrink-0 items-center justify-center">
                  {isNext ? (
                    <span className="bg-primary inline-block h-2 w-2 rounded-full" />
                  ) : isPassed ? (
                    <span className="bg-on-surface-faint inline-block h-1 w-1 rounded-full" />
                  ) : (
                    <span className="bg-on-surface-muted inline-block h-1.5 w-1.5 rounded-full" />
                  )}
                </span>
                <span className="min-w-0 truncate">{stop.name}</span>
                {showBadge && badgeText && stopArrivalDate && (
                  <time
                    dateTime={stopArrivalDate.toISOString()}
                    title={stopArrivalDate.toLocaleString()}
                    className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                      isNext ? "bg-primary text-on-primary" : "bg-surface-dim text-on-surface-muted"
                    }`}
                  >
                    {badgeText}
                  </time>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-outline flex shrink-0 items-center gap-2 border-t px-4 py-2">
        <label className="text-on-surface-muted flex cursor-pointer items-center gap-2 text-xs font-semibold select-none">
          Follow
          <button
            role="switch"
            aria-checked={followEnabled}
            type="button"
            onClick={onToggleFollow}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${followEnabled ? "bg-primary" : "bg-on-surface-faint"}`}
          >
            <span
              className={`bg-surface inline-block h-5 w-5 rounded-full shadow-sm transition-transform ${followEnabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams({ vehicle: vehicle.id });
              if (vehicle.tripId) params.set("trip", vehicle.tripId);
              const url = `${location.origin}${location.pathname}?${params}`;
              if (navigator.share) {
                const shareTitle = `[${vehicle.routeId}] ${vehicle.getDisplayName()}`;

                navigator.share({ title: shareTitle, url }).catch(() => {});
              } else {
                navigator.clipboard.writeText(url).then(
                  () =>
                    toast.success("Link copied to clipboard", {
                      dismissible: true,
                    }),
                  () => {},
                );
              }
            }}
            className="bg-surface-dim text-on-surface-muted hover:bg-surface-hover flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
          <button
            type="button"
            onClick={onLocate}
            className="bg-surface-dim text-on-surface-muted hover:bg-surface-hover flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            Center
          </button>
        </div>
      </div>
    </div>
  );
}
