import { signal, computed } from "@preact/signals";
import { useSignalState } from "./hooks/use-signal-state";

export type MapStyleId = "3d" | "3d.dark" | "flat" | "satellite";

const DEFAULTS = {
  mapStyle: "3d" as MapStyleId,
  wakeLockEnabled: true,
};

export type Settings = typeof DEFAULTS;

const STORAGE_KEY = "settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        mapStyle: isValidMapStyle(parsed.mapStyle) ? parsed.mapStyle : DEFAULTS.mapStyle,
        wakeLockEnabled:
          typeof parsed.wakeLockEnabled === "boolean"
            ? parsed.wakeLockEnabled
            : DEFAULTS.wakeLockEnabled,
      };
    }
  } catch (e) {
    console.error("Failed to load settings from localStorage", e);
  }
  return { ...DEFAULTS };
}

function isValidMapStyle(value: unknown): value is MapStyleId {
  return value === "3d" || value === "3d.dark" || value === "flat" || value === "satellite";
}

function persist(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to persist settings to localStorage", e);
  }
}

const settingsSignal = signal<Settings>(loadSettings());

export function settingSignal<T extends keyof Settings>(key: T) {
  return computed(() => settingsSignal.value[key]);
}

export function useSetting<T extends keyof Settings>(key: T) {
  return useSignalState(settingSignal(key));
}

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settingsSignal.value = { ...settingsSignal.value, [key]: value };
  persist(settingsSignal.value);
}

export function setMapStyleId(id: MapStyleId) {
  updateSetting("mapStyle", id);
  globalThis.location.reload();
}
