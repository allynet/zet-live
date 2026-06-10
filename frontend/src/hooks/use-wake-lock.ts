import { useEffect, useRef } from "react";

export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  async function requestLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
      sentinelRef.current.addEventListener("release", () => {
        sentinelRef.current = null;
      });
    } catch {
      // wake lock request failed (e.g. user denied, or page not focused)
    }
  }

  function releaseLock() {
    void sentinelRef.current?.release();
    sentinelRef.current = null;
  }

  useEffect(() => {
    if (enabled) {
      void requestLock();
    } else {
      releaseLock();
    }

    return () => {
      releaseLock();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) return;

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestLock();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);
}
