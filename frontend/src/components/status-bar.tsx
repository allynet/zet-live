import { useEffect, useState } from "react";
import { useStore } from "@/store";

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
  const lastUpdate = useStore((s) => s.lastUpdate);
  const lastError = useStore((s) => s.lastError);
  const wsConnected = useStore((s) => s.wsConnected);
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
      className="bg-surface-overlay text-on-surface flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs shadow-md backdrop-blur-sm select-none"
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${wsConnected ? "bg-success" : "bg-danger animate-pulse"}`}
      />
      {expanded && (
        <div
          aria-label="Connection status details"
          aria-modal="true"
          role="menu"
          id="connection-status-panel"
          className="flex items-center gap-2"
        >
          <span>{wsConnected ? "Connected" : "Disconnected"}</span>
          <span className="text-on-surface-muted">|</span>
          <span>Last update: {ago}</span>
          {lastError && (
            <>
              <span className="text-on-surface-muted">|</span>
              <span className="text-on-danger-container">{lastError}</span>
            </>
          )}
        </div>
      )}
    </button>
  );
}
