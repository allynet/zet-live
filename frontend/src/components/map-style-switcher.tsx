import { useState, useEffect, useRef } from "preact/hooks";
import { mapStyleIdSignal, setMapStyleId, type MapStyleId } from "@/state";
import { useSignalState } from "@/hooks/use-signal-state";

const STYLES: { id: MapStyleId; label: string }[] = [
  { id: "3d", label: "3D" },
  { id: "3d.dark", label: "3D Dark" },
  { id: "flat", label: "Flat" },
  { id: "satellite", label: "Satellite" },
];

export function MapStyleSwitcher() {
  const [open, setOpen] = useState(false);
  const currentStyle = useSignalState(mapStyleIdSignal);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={panelRef} class="absolute top-14 left-2 z-1000">
      <button
        type="button"
        aria-label="Change map style"
        aria-expanded={open}
        aria-controls="map-style-panel"
        aria-haspopup="menu"
        aria-roledescription="map style switcher"
        role="button"
        onClick={() => {
          setOpen((o) => !o);
        }}
        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-white/80 text-gray-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white/90"
        title="Change map style"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>

      {open && (
        <div
          aria-label="Map style panel"
          aria-modal="true"
          role="menu"
          class="mt-1 flex flex-col gap-0.5 rounded-lg bg-white/90 p-1 shadow-md backdrop-blur-sm"
          id="map-style-panel"
        >
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Select ${s.label} map style`}
              aria-selected={currentStyle === s.id}
              role="menuitem"
              onClick={() => {
                setMapStyleId(s.id);
                setOpen(false);
              }}
              class={`cursor-pointer rounded-md px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                currentStyle === s.id
                  ? "bg-blue-100 text-blue-800"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
