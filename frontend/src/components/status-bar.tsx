import { useEffect, useState } from "preact/hooks";
import { lastUpdateSignal, lastErrorSignal, wsConnectedSignal } from "@/state";
import { useSignalState } from "@/hooks/use-signal-state";

function formatAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function StatusBar() {
  const [expanded, setExpanded] = useState(false);
  const lastUpdate = useSignalState(lastUpdateSignal);
  const lastError = useSignalState(lastErrorSignal);
  const wsConnected = useSignalState(wsConnectedSignal);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  const ago = lastUpdate ? formatAgo(Date.now() - lastUpdate) : "never";

  return (
    <button
      type="button"
      aria-label="Connection status"
      aria-expanded={expanded}
      aria-controls="connection-status-panel"
      aria-haspopup="menu"
      aria-roledescription="connection status"
      role="button"
      onClick={() => {
        setExpanded((e) => !e);
      }}
      class="flex cursor-pointer items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs text-gray-800 shadow-md backdrop-blur-sm select-none"
    >
      <span
        class={`inline-block h-2 w-2 shrink-0 rounded-full ${wsConnected ? "bg-green-500" : "animate-pulse bg-red-500"}`}
      />
      {expanded && (
        <div
          aria-label="Connection status details"
          aria-modal="true"
          role="menu"
          id="connection-status-panel"
          class="flex items-center gap-2"
        >
          <span>{wsConnected ? "Connected" : "Disconnected"}</span>
          <span class="text-gray-400">|</span>
          <span>Last update: {ago}</span>
          {lastError && (
            <>
              <span class="text-gray-400">|</span>
              <span class="text-red-600">{lastError}</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}
