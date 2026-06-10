import { useEffect } from "react";
import { create } from "zustand";
import {
  settingsStore,
  type UiTheme,
  type UiThemeMode,
  type MapStyleId,
  type MapThemeMode,
} from "@/settings";
import { getTimes } from "@/utils/suncalc";

const ZAGREB_LAT = 45.8;
const ZAGREB_LNG = 16.0;

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

function recompute() {
  const { mapThemeMode, mapStyle, uiThemeMode, uiThemeManual } = settingsStore.getState();
  const resolvedMapStyleId = resolveMapStyle(mapThemeMode, mapStyle);
  const resolvedTheme = resolveTheme(uiThemeMode, uiThemeManual, resolvedMapStyleId);

  themeStore.setState({ resolvedTheme, resolvedMapStyleId });
  applyTheme(resolvedTheme);
}

type ThemeState = {
  resolvedTheme: UiTheme;
  resolvedMapStyleId: MapStyleId;
};

const initialMapStyle = resolveMapStyle(
  settingsStore.getState().mapThemeMode,
  settingsStore.getState().mapStyle,
);
const initialTheme = resolveTheme(
  settingsStore.getState().uiThemeMode,
  settingsStore.getState().uiThemeManual,
  initialMapStyle,
);

export const themeStore = create<ThemeState>()(() => ({
  resolvedTheme: initialTheme,
  resolvedMapStyleId: initialMapStyle,
}));

export function useTheme() {
  useEffect(() => {
    recompute();

    const mediaQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    mediaQuery?.addEventListener("change", recompute);

    const interval = setInterval(recompute, 60_000);

    const unsub = settingsStore.subscribe(recompute);

    return () => {
      mediaQuery?.removeEventListener("change", recompute);
      clearInterval(interval);
      unsub();
    };
  }, []);
}
