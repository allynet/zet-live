import { useEffect, useCallback } from "react";
import {
  getSharedWorker,
  postWorkerMessage,
  startWorkerStopsFetching,
  stopWorkerStopsFetching,
  type WorkerResponse,
} from "./use-worker";
import { API_URL } from "@/app/consts";
import { processMessage, handleStopsUpdate } from "./use-stops";
import { useStore } from "@/store";

export function useWebSocket() {
  useEffect(() => {
    const worker = getSharedWorker();

    const handler = (e: MessageEvent<WorkerResponse>) => {
      const response = e.data;
      switch (response.type) {
        case "processed-message": {
          processMessage(response.data);
          return;
        }
        case "stops-update": {
          handleStopsUpdate(response);
          return;
        }
        default: {
          console.error("Unknown message type from worker", (response as { type: string }).type);
          return;
        }
      }
    };

    worker.addEventListener("message", handler);

    startWorkerStopsFetching(worker);

    return () => {
      stopWorkerStopsFetching(worker);
      worker.removeEventListener("message", handler);
    };
  }, []);

  const websocketUrl = (() => {
    const url = new URL(`${API_URL}/v1/ws`, window.location.href);
    if (url.protocol === "https:") {
      url.protocol = "wss:";
    } else {
      url.protocol = "ws:";
    }
    return url.toString();
  })();

  const sendToWorker = useCallback((data: Blob) => {
    const worker = getSharedWorker();
    postWorkerMessage(worker, data);
    useStore.setState({ lastUpdate: Date.now(), lastError: null });
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    async function connectWebSocket() {
      return new Promise<null>((resolve) => {
        if (signal.aborted) {
          resolve(null);
          return;
        }

        console.log("Connecting to WebSocket", websocketUrl);
        const ws = new WebSocket(websocketUrl);

        const onAbort = () => {
          ws.close();
        };
        signal.addEventListener("abort", onAbort, { once: true });

        ws.addEventListener(
          "error",
          (e) => {
            console.error("WebSocket error", e);
            useStore.setState({ lastError: "Connection error", wsConnected: false });
            ws.close();
          },
          { signal },
        );

        ws.addEventListener(
          "close",
          (e) => {
            console.log("WebSocket closed", e);
            useStore.setState({ wsConnected: false });
            signal.removeEventListener("abort", onAbort);
            resolve(null);
          },
          { once: true },
        );

        ws.addEventListener(
          "open",
          (e) => {
            console.log("WebSocket opened", e);
            useStore.setState({ wsConnected: true, lastError: null });
          },
          { signal },
        );

        ws.addEventListener(
          "message",
          (e) => {
            console.log("Got data", { len: (e.data as Blob).size });
            sendToWorker(e.data as Blob);
          },
          { signal },
        );
      });
    }

    async function loop() {
      while (!signal.aborted) {
        await connectWebSocket();
        if (signal.aborted) break;
        const sleepFor = 3000 + 10_000 * Math.random();
        console.log("Sleeping before reconnect", sleepFor);
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, sleepFor);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
            },
            { once: true },
          );
        });
      }
    }

    void loop();

    return () => {
      abortController.abort();
    };
  }, [websocketUrl, sendToWorker]);

  return { sendToWorker };
}
