import { useEffect } from "preact/hooks";
import { toast } from "sonner";
import type { VehicleV1 } from "@/app/entity/v1/vehicle";

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
      cancelIdleCallback(timeout);
      cancelAnimationFrame(timeout);
    };
  }, [vehicle.id]);

  return (
    <div class="flex max-h-full flex-col">
      <div class="max-h-full overflow-y-auto px-4 pb-3">
        <ul class="bottom-vehicle-stop-list space-y-0.5">
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
                class={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors duration-300 hover:bg-gray-200 hover:transition-none ${
                  isNext
                    ? "bg-blue-100/80 font-bold text-blue-900"
                    : isPassed
                      ? "text-gray-400"
                      : "text-gray-700"
                }`}
                onClick={() => {
                  onStopClick(stop.ids);
                }}
              >
                <span class="flex shrink-0 items-center justify-center">
                  {isNext ? (
                    <span class="inline-block h-2 w-2 rounded-full bg-blue-600" />
                  ) : isPassed ? (
                    <span class="inline-block h-1 w-1 rounded-full bg-gray-300" />
                  ) : (
                    <span class="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                  )}
                </span>
                <span class="min-w-0 truncate">{stop.name}</span>
                {showBadge && badgeText && stopArrivalDate && (
                  <time
                    datetime={stopArrivalDate.toISOString()}
                    title={stopArrivalDate.toLocaleString()}
                    class={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                      isNext ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
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
      <div class="flex shrink-0 items-center gap-2 border-t border-gray-200 px-4 py-2">
        <label class="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600 select-none">
          Follow
          <button
            role="switch"
            aria-checked={followEnabled}
            type="button"
            onClick={onToggleFollow}
            class={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${followEnabled ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <span
              class={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${followEnabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </label>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams({ vehicle: vehicle.id });
              if (vehicle.tripId) params.set("trip", vehicle.tripId);
              const url = `${location.origin}${location.pathname}?${params}`;
              if (navigator.share) {
                const title = vehicle.routeLongName
                  ? `[${vehicle.routeId}] ${vehicle.routeLongName.trim()}`
                  : `Route ${vehicle.routeId}`;

                navigator.share({ title, url }).catch(() => {});
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
            class="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
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
            class="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
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
