import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import {
  settingSignal,
  type UiTheme,
  type UiThemeMode,
  type MapStyleId,
  type MapThemeMode,
} from "@/settings";
import { getTimes } from "@/utils/suncalc";

const ZAGREB_LAT = 45.8;
const ZAGREB_LNG = 16.0;

const uiThemeModeSignal = settingSignal("uiThemeMode");
const uiThemeManualSignal = settingSignal("uiThemeManual");
const mapThemeModeSignal = settingSignal("mapThemeMode");
const mapStyleSignal = settingSignal("mapStyle");

function resolveFromDevice(): UiTheme {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveFromTime(): UiTheme {
  const now = new Date();
  const times = getTimes(now, ZAGREB_LAT, ZAGREB_LNG, 0);
  if (now < times.sunrise || now > times.sunset) return "dark";
  return "light";
}

function resolveMapStyle(mode: MapThemeMode, manual: MapStyleId): MapStyleId {
  switch (mode) {
    case "device":
      return resolveFromDevice() === "dark" ? "3d.dark" : "3d";
    case "time":
      return resolveFromTime() === "dark" ? "3d.dark" : "3d";
    case "manual":
      return manual;
  }
}

function resolveTheme(mode: UiThemeMode, manual: UiTheme, mapStyle: MapStyleId): UiTheme {
  switch (mode) {
    case "device":
      return resolveFromDevice();
    case "time":
      return resolveFromTime();
    case "map":
      return mapStyle === "3d.dark" ? "dark" : "light";
    case "manual":
      return manual;
  }
}

function applyTheme(theme: UiTheme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

const initialMapStyle = resolveMapStyle(mapThemeModeSignal.value, mapStyleSignal.value);
const initialTheme = resolveTheme(
  uiThemeModeSignal.value,
  uiThemeManualSignal.value,
  initialMapStyle,
);

export const resolvedThemeSignal = signal<UiTheme>(initialTheme);
export const resolvedMapStyleIdSignal = signal<MapStyleId>(initialMapStyle);

export function useTheme() {
  function recompute() {
    const mapStyle = resolveMapStyle(mapThemeModeSignal.value, mapStyleSignal.value);
    resolvedMapStyleIdSignal.value = mapStyle;

    const theme = resolveTheme(uiThemeModeSignal.value, uiThemeManualSignal.value, mapStyle);
    resolvedThemeSignal.value = theme;
    applyTheme(theme);
  }

  useSignalEffect(() => {
    recompute();
  });

  useEffect(() => {
    recompute();

    const mediaQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    mediaQuery?.addEventListener("change", recompute);

    const interval = setInterval(recompute, 60_000);

    return () => {
      mediaQuery?.removeEventListener("change", recompute);
      clearInterval(interval);
    };
  }, []);
}
