import { useEffect } from "preact/hooks";
import { API_URL } from "@/app/consts";
import { toast } from "sonner";

const CHECK_INTERVAL = 60 * 1000;
const AUTO_REFRESH_DELAY = 15 * 1000;

type VersionResponse = {
  id: string;
};

async function fetchVersionId(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/v1/version`);
    if (!response.ok) return null;
    const data = (await response.json()) as VersionResponse;
    return data.id;
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  useEffect(() => {
    let initialVersionId: string | null = null;
    let dismissedVersionId: string | null = null;
    let initialized = false;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    async function checkVersion() {
      const serverId = await fetchVersionId();
      if (serverId === null) return;

      if (!initialized) {
        initialVersionId = serverId;
        initialized = true;
        return;
      }

      if (serverId === initialVersionId) return;
      if (serverId === dismissedVersionId) return;

      reloadTimer = setTimeout(() => {
        window.location.reload();
      }, AUTO_REFRESH_DELAY);

      toast.info("New version available", {
        description: "The page will refresh automatically in 15 seconds.",
        duration: AUTO_REFRESH_DELAY + 1000,
        action: {
          label: "Refresh now",
          onClick: () => {
            window.location.reload();
          },
        },
        onDismiss: () => {
          if (reloadTimer !== null) {
            clearTimeout(reloadTimer);
            reloadTimer = null;
          }
          dismissedVersionId = serverId;
        },
      });
    }

    void checkVersion();
    const intervalId = setInterval(() => void checkVersion(), CHECK_INTERVAL);

    return () => {
      clearInterval(intervalId);
      if (reloadTimer !== null) {
        clearTimeout(reloadTimer);
      }
    };
  }, []);
}
