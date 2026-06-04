import { useEffect, useRef, useState } from "preact/hooks";
import { useSignalState } from "@/hooks/use-signal-state";
import { lastUpdateSignal, simpleStopsSignal, wsConnectedSignal, mapReadySignal } from "@/state";

type Step = {
  label: string;
  done: boolean;
};

const FADE_DURATION = 250;
const MIN_LOADING_TIME = 150;

function CheckIcon({ done }: { done: boolean }) {
  if (!done) {
    return <span class="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-gray-400" />;
  }

  return (
    <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500">
      <svg
        class="h-3 w-3 text-white"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

export function LoadingScreen() {
  const wsConnected = useSignalState(wsConnectedSignal);
  const lastUpdate = useSignalState(lastUpdateSignal);
  const simpleStops = useSignalState(simpleStopsSignal);
  const mapReady = useSignalState(mapReadySignal);

  const mountTime = useRef(Date.now());
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  const vehiclesLoaded = lastUpdate !== null;
  const stopsLoaded = Object.keys(simpleStops).length > 0;

  const steps: Step[] = [
    { label: "Connecting to API", done: wsConnected },
    { label: "Loading vehicles", done: vehiclesLoaded },
    { label: "Loading stops", done: stopsLoaded },
    { label: "Loading map", done: mapReady },
  ];

  const allDone = steps.every((s) => s.done);

  useEffect(() => {
    if (!allDone) return;

    const elapsed = Date.now() - mountTime.current;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);

    if (remaining > 0) {
      const hideTimer = setTimeout(() => {
        setHidden(true);
      }, remaining);
      return () => {
        clearTimeout(hideTimer);
      };
    }

    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 0);
    const hideTimer = setTimeout(() => {
      setHidden(true);
    }, FADE_DURATION);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [allDone]);

  if (hidden) return null;

  return (
    <div
      class="fixed inset-0 z-9999 flex items-center justify-center bg-white"
      style={fading ? { transition: `opacity ${FADE_DURATION}ms ease-out`, opacity: 0 } : undefined}
    >
      <div class="flex flex-col items-center gap-6">
        <div class="flex flex-col items-center gap-2">
          <h1 class="text-2xl font-bold text-gray-900">ZET Live</h1>
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>

        <ul class="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.label} class="flex items-center gap-2 text-sm text-gray-700">
              <CheckIcon done={step.done} />
              <span class={step.done ? "text-gray-400 line-through" : ""}>{step.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
