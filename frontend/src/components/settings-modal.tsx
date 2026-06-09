import { useEffect, useRef } from "preact/hooks";
import { motion, AnimatePresence } from "motion/react";
import {
  settingSignal,
  updateSetting,
  type MapStyleId,
  type MapThemeMode,
  type UiThemeMode,
  type UiTheme,
} from "@/settings";
import { useSignalState } from "@/hooks/use-signal-state";
import { ReactNode } from "preact/compat";
import { signal } from "@preact/signals";

const MAP_STYLES: { id: MapStyleId; label: string }[] = [
  { id: "3d", label: "3D" },
  { id: "3d.dark", label: "3D Dark" },
  { id: "flat", label: "Flat" },
  { id: "satellite", label: "Satellite" },
];

const MAP_THEME_MODES: { id: MapThemeMode; label: string; description: string }[] = [
  { id: "device", label: "Device", description: "System preference" },
  { id: "time", label: "Sun Cycle", description: "Sunrise & sunset" },
  { id: "manual", label: "Manual", description: "Choose yourself" },
];

const UI_THEME_MODES: { id: UiThemeMode; label: string; description: string }[] = [
  { id: "device", label: "Device", description: "System preference" },
  { id: "time", label: "Sun Cycle", description: "Sunrise & sunset" },
  { id: "map", label: "Map", description: "Match map style" },
  { id: "manual", label: "Manual", description: "Choose yourself" },
];

const UI_THEMES: { id: UiTheme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const settingsOpenSignal = signal(false);
const mapStyleIdSignal = settingSignal("mapStyle");
const mapThemeModeSignal = settingSignal("mapThemeMode");
const wakeLockEnabledSignal = settingSignal("wakeLockEnabled");
const uiThemeModeSignal = settingSignal("uiThemeMode");
const uiThemeManualSignal = settingSignal("uiThemeManual");

export function SettingsModal() {
  const open = useSignalState(settingsOpenSignal);
  const currentStyle = useSignalState(mapStyleIdSignal);
  const mapThemeMode = useSignalState(mapThemeModeSignal);
  const wakeLockEnabled = useSignalState(wakeLockEnabledSignal);
  const uiThemeMode = useSignalState(uiThemeModeSignal);
  const uiThemeManual = useSignalState(uiThemeManualSignal);
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
            class="bg-surface relative z-10 max-h-[85dvh] w-[90vw] max-w-md overflow-auto rounded-2xl shadow-xl"
            aria-label="Settings"
            aria-modal="true"
            aria-expanded="true"
          >
            <div class="bg-surface sticky top-0 flex items-center justify-between rounded-t-2xl px-4 py-2">
              <h2 class="text-on-surface text-base font-bold">Settings</h2>
              <button
                type="button"
                aria-label="Close settings"
                aria-expanded={settingsOpenSignal.value}
                aria-controls="settings-panel"
                onClick={() => {
                  settingsOpenSignal.value = false;
                }}
                class="text-on-surface-faint hover:bg-surface-hover hover:text-on-surface-muted rounded-full p-2 transition-colors"
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
                title="Appearance"
                sections={[
                  {
                    title: "Theme Source",
                    description: "Control when dark mode is active.",
                    body: (
                      <div class="grid grid-cols-2 gap-2">
                        {UI_THEME_MODES.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              updateSetting("uiThemeMode", m.id);
                            }}
                            class={`cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                              uiThemeMode === m.id
                                ? "border-primary bg-primary-container text-on-primary-container"
                                : "border-outline bg-surface text-on-surface-variant hover:bg-surface-hover"
                            }`}
                            aria-selected={uiThemeMode === m.id}
                          >
                            <span class="block">{m.label}</span>
                            <span class="text-on-surface-muted block text-xs font-normal">
                              {m.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    ),
                  },
                  ...(uiThemeMode === "manual"
                    ? [
                        {
                          title: "Theme",
                          description: "Choose between light and dark appearance.",
                          body: (
                            <div class="grid grid-cols-2 gap-2">
                              {UI_THEMES.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    updateSetting("uiThemeManual", t.id);
                                  }}
                                  class={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                    uiThemeManual === t.id
                                      ? "border-primary bg-primary-container text-on-primary-container"
                                      : "border-outline bg-surface text-on-surface-variant hover:bg-surface-hover"
                                  }`}
                                  aria-selected={uiThemeManual === t.id}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
              />

              <SettingsCategory
                title="Map"
                sections={[
                  {
                    title: "Style Source",
                    description: "Auto-switch between 3D and 3D Dark, or pick a style manually.",
                    body: (
                      <div class="grid grid-cols-3 gap-2">
                        {MAP_THEME_MODES.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              updateSetting("mapThemeMode", m.id);
                            }}
                            class={`cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                              mapThemeMode === m.id
                                ? "border-primary bg-primary-container text-on-primary-container"
                                : "border-outline bg-surface text-on-surface-variant hover:bg-surface-hover"
                            }`}
                            aria-selected={mapThemeMode === m.id}
                          >
                            <span class="block">{m.label}</span>
                            <span class="text-on-surface-muted block text-xs font-normal">
                              {m.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    ),
                  },
                  ...(mapThemeMode === "manual"
                    ? [
                        {
                          title: "Style",
                          description: "Choose the visual style for the map.",
                          body: (
                            <div class="grid grid-cols-2 gap-2">
                              {MAP_STYLES.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    updateSetting("mapStyle", s.id);
                                  }}
                                  class={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                    currentStyle === s.id
                                      ? "border-primary bg-primary-container text-on-primary-container"
                                      : "border-outline bg-surface text-on-surface-variant hover:bg-surface-hover"
                                  }`}
                                  aria-selected={currentStyle === s.id}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          ),
                        },
                      ]
                    : []),
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
                            ? "border-success bg-success-container text-on-success-container"
                            : "border-outline bg-surface text-on-surface-variant hover:bg-surface-hover"
                        }`}
                      >
                        <span>{wakeLockEnabled ? "Screen stays on" : "Screen can turn off"}</span>
                        <span
                          class={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            wakeLockEnabled
                              ? "bg-success-container text-on-success-container"
                              : "bg-surface-dim text-on-surface-muted"
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
      class="bg-surface-overlay text-on-surface-variant hover:bg-surface flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg shadow-md backdrop-blur-sm transition-colors"
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
      <h3 class="text-on-surface-muted mb-2 text-xs font-semibold tracking-wide uppercase">
        {props.title}
      </h3>
      <div class="flex flex-col gap-2">
        {props.sections.map((s, i) => (
          <div key={i} class="bg-surface-dim flex flex-col rounded-xl p-3">
            <div class="text-on-surface mb-1 cursor-default text-sm font-medium">{s.title}</div>
            <div class="text-on-surface-muted cursor-default text-xs not-last:mb-3">
              {s.description}
            </div>
            {s.body}
          </div>
        ))}
      </div>
    </section>
  );
}
