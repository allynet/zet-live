import type { V1Message } from "@/app/entity/v1/message";
import type { GroupedStop } from "@/state";

export type WorkerMessage =
  | { type: "process-message"; data: Blob }
  | { type: "start-fetching-stops" }
  | { type: "stop-fetching-stops" };

export type StopData = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export type StopsUpdateResponse = {
  type: "stops-update";
  stops?: StopData[];
  bounds?: [[number, number], [number, number]];
  grouped: GroupedStop[];
};

export type WorkerResponse =
  | {
      type: "processed-message";
      data: V1Message;
    }
  | StopsUpdateResponse;

export function postWorkerMessage(worker: Worker, data: Blob) {
  const msg: WorkerMessage = { type: "process-message", data };
  worker.postMessage(msg);
}

export function startWorkerStopsFetching(worker: Worker) {
  const msg: WorkerMessage = { type: "start-fetching-stops" };
  worker.postMessage(msg);
}

export function stopWorkerStopsFetching(worker: Worker) {
  const msg: WorkerMessage = { type: "stop-fetching-stops" };
  worker.postMessage(msg);
}

let workerInstance: Worker | null = null;

export function getSharedWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL("../scripts/worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return workerInstance;
}

export function terminateSharedWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

export type { V1Message };
