import { create } from "zustand";

export type MapStyleId = "3d" | "3d.dark" | "flat" | "satellite";
export type MapThemeMode = "device" | "time" | "manual";
export type UiThemeMode = "device" | "time" | "map" | "manual";
export type UiTheme = "light" | "dark";

const DEFAULTS = {
  mapStyle: "3d" as MapStyleId,
  mapThemeMode: "manual" as MapThemeMode,
  wakeLockEnabled: true,
  uiThemeMode: "manual" as UiThemeMode,
  uiThemeManual: "light" as UiTheme,
  showGbfsStations: true,
  showBuses: true,
  showTrams: true,
};

export type Settings = typeof DEFAULTS & {
  _settingsOpen: boolean;
};

const STORAGE_KEY = "settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        mapStyle: isValidMapStyle(parsed.mapStyle) ? parsed.mapStyle : DEFAULTS.mapStyle,
        mapThemeMode: isValidMapThemeMode(parsed.mapThemeMode)
          ? parsed.mapThemeMode
          : DEFAULTS.mapThemeMode,
        wakeLockEnabled:
          typeof parsed.wakeLockEnabled === "boolean"
            ? parsed.wakeLockEnabled
            : DEFAULTS.wakeLockEnabled,
        uiThemeMode: isValidUiThemeMode(parsed.uiThemeMode)
          ? parsed.uiThemeMode
          : DEFAULTS.uiThemeMode,
        uiThemeManual: isValidUiTheme(parsed.uiThemeManual)
          ? parsed.uiThemeManual
          : DEFAULTS.uiThemeManual,
        showGbfsStations:
          typeof parsed.showGbfsStations === "boolean"
            ? parsed.showGbfsStations
            : DEFAULTS.showGbfsStations,
        showBuses: typeof parsed.showBuses === "boolean" ? parsed.showBuses : DEFAULTS.showBuses,
        showTrams: typeof parsed.showTrams === "boolean" ? parsed.showTrams : DEFAULTS.showTrams,
        _settingsOpen: false,
      };
    }
  } catch (e) {
    console.error("Failed to load settings from localStorage", e);
  }
  return { ...DEFAULTS, _settingsOpen: false };
}

function isValidMapStyle(value: unknown): value is MapStyleId {
  return value === "3d" || value === "3d.dark" || value === "flat" || value === "satellite";
}

function isValidMapThemeMode(value: unknown): value is MapThemeMode {
  return value === "device" || value === "time" || value === "manual";
}

function isValidUiThemeMode(value: unknown): value is UiThemeMode {
  return value === "device" || value === "time" || value === "map" || value === "manual";
}

function isValidUiTheme(value: unknown): value is UiTheme {
  return value === "light" || value === "dark";
}

function persist(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to persist settings to localStorage", e);
  }
}

export const settingsStore = create<Settings>()(() => loadSettings());

export function useSetting<T extends keyof Settings>(key: T): Settings[T] {
  return settingsStore((s) => s[key]);
}

export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settingsStore.setState({ [key]: value });
  persist(settingsStore.getState());
}
