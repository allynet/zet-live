import type { V1Message } from "@/app/entity/v1/message";

export type WorkerMessage = {
  type: "process-message";
  data: Blob;
};

export type WorkerResponse = {
  type: "processed-message";
  data: V1Message;
};

export function postWorkerMessage(worker: Worker, data: Blob) {
  const msg: WorkerMessage = { type: "process-message", data };
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
