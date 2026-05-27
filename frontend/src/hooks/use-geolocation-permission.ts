import { useState, useEffect } from "preact/hooks";

export type GeolocationPermissionState = "unavailable" | "denied" | "prompt" | "granted";

export function useGeolocationPermission(): GeolocationPermissionState {
  const [state, setState] = useState<GeolocationPermissionState>(() => checkInitial());

  useEffect(() => {
    let mounted = true;
    let permissionStatus: PermissionStatus | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function update(value: GeolocationPermissionState) {
      if (mounted) setState(value);
    }

    async function setup() {
      if (!navigator.geolocation) {
        intervalId = setInterval(() => {
          if (navigator.geolocation) {
            if (intervalId !== null) clearInterval(intervalId);
            intervalId = null;
            update("prompt");
            void setup();
          }
        }, 5000);
        update("unavailable");
        return;
      }

      if (navigator.permissions) {
        try {
          permissionStatus = await navigator.permissions.query({ name: "geolocation" });
          if (!mounted) return;

          const mapState = (s: PermissionState): GeolocationPermissionState => {
            if (s === "granted") return "granted";
            if (s === "denied") return "denied";
            return "prompt";
          };

          update(mapState(permissionStatus.state));

          const onChange = () => {
            if (permissionStatus) {
              update(mapState(permissionStatus.state));
            }
          };

          permissionStatus.addEventListener("change", onChange);
        } catch {
          update("prompt");
        }
      } else {
        update("prompt");
      }
    }

    void setup();

    return () => {
      mounted = false;
      if (permissionStatus) {
        permissionStatus.removeEventListener("change", () => {});
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return state;
}

function checkInitial(): GeolocationPermissionState {
  if (!navigator.geolocation) return "unavailable";
  return "prompt";
}
