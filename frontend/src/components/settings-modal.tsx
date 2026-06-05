import { useEffect, useRef } from "preact/hooks";
import { motion, AnimatePresence } from "motion/react";
import { setMapStyleId, settingSignal, updateSetting, type MapStyleId } from "@/settings";
import { useSignalState } from "@/hooks/use-signal-state";
import { ReactNode } from "preact/compat";
import { signal } from "@preact/signals";

const MAP_STYLES: { id: MapStyleId; label: string }[] = [
  { id: "3d", label: "3D" },
  { id: "3d.dark", label: "3D Dark" },
  { id: "flat", label: "Flat" },
  { id: "satellite", label: "Satellite" },
];

const settingsOpenSignal = signal(false);
const mapStyleIdSignal = settingSignal("mapStyle");
const wakeLockEnabledSignal = settingSignal("wakeLockEnabled");

export function SettingsModal() {
  const open = useSignalState(settingsOpenSignal);
  const currentStyle = useSignalState(mapStyleIdSignal);
  const wakeLockEnabled = useSignalState(wakeLockEnabledSignal);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        settingsOpenSignal.value = false;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div
          id="settings-panel"
          class="pointer-events-auto fixed inset-0 z-2000 flex items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            class="absolute inset-0 bg-black/30"
            onClick={() => {
              settingsOpenSignal.value = false;
            }}
          />

          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            class="relative z-10 max-h-[85dvh] w-[90vw] max-w-md overflow-auto rounded-2xl bg-white shadow-xl"
            aria-label="Settings"
            aria-modal="true"
            aria-expanded="true"
          >
            <div class="sticky top-0 flex items-center justify-between rounded-t-2xl bg-white px-4 py-2">
              <h2 class="text-base font-bold text-gray-900">Settings</h2>
              <button
                type="button"
                aria-label="Close settings"
                aria-expanded={settingsOpenSignal.value}
                aria-controls="settings-panel"
                onClick={() => {
                  settingsOpenSignal.value = false;
                }}
                class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-200/60 hover:text-gray-600"
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
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div class="flex flex-col gap-6 px-5 pb-5">
              <SettingsCategory
                title="Map"
                sections={[
                  {
                    title: "Theme",
                    description: (
                      <>
                        Choose the visual style for the map. <br />
                        <strong>Note: Changing the theme will reload the page.</strong>
                      </>
                    ),
                    body: (
                      <div class="grid grid-cols-2 gap-2">
                        {MAP_STYLES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setMapStyleId(s.id);
                            }}
                            class={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                              currentStyle === s.id
                                ? "border-blue-300 bg-blue-100 text-blue-800"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                            aria-selected={currentStyle === s.id}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />

              <SettingsCategory
                title="General"
                sections={[
                  {
                    title: "Keep Screen Awake",
                    description:
                      "Prevent your screen from turning off while tracking transit. Uses the browser Wake Lock API.",
                    body: (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={wakeLockEnabled}
                        onClick={() => {
                          updateSetting("wakeLockEnabled", !wakeLockEnabled);
                        }}
                        class={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                          wakeLockEnabled
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span>{wakeLockEnabled ? "Screen stays on" : "Screen can turn off"}</span>
                        <span
                          class={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            wakeLockEnabled
                              ? "bg-emerald-200 text-emerald-800"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {wakeLockEnabled ? "On" : "Off"}
                        </span>
                      </button>
                    ),
                  },
                ]}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SettingsButton() {
  return (
    <button
      type="button"
      aria-label="Open settings"
      onClick={() => {
        settingsOpenSignal.value = true;
      }}
      aria-expanded={settingsOpenSignal.value}
      aria-controls="settings-panel"
      class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-white/80 text-gray-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white/90"
      title="Settings"
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
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}

function SettingsCategory(props: {
  title: ReactNode;
  sections: {
    title: ReactNode;
    description: ReactNode;
    body?: ReactNode;
  }[];
}) {
  return (
    <section>
      <h3 class="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {props.title}
      </h3>
      <div class="flex flex-col gap-2">
        {props.sections.map((s, i) => (
          <div key={i} class="flex flex-col rounded-xl bg-gray-100 p-3">
            <div class="mb-1 cursor-default text-sm font-medium text-gray-900">{s.title}</div>
            <div class="cursor-default text-xs text-gray-600 not-last:mb-3">{s.description}</div>
            {s.body}
          </div>
        ))}
      </div>
    </section>
  );
}
