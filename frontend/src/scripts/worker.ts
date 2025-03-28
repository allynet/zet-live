import { z } from "zod";
import { v1MessageSchema, type V1Message } from "../app/v1/entity/message";
import { decode as decodeCbor } from "cbor2";

const messageValidator = z.object({
  type: z.literal("process-message"),
  data: z.instanceof(Blob),
});

export type WorkerMessage = z.infer<typeof messageValidator>;

export type WorkerResponse = {
  type: "processed-message";
  data: V1Message;
};

addEventListener("message", (e: MessageEvent<WorkerMessage>) => {
  const validated = messageValidator.safeParse(e.data);
  if (!validated.success) {
    console.error(validated.error);
    return;
  }
  const message = validated.data;
  console.log("[WORKER]", "Received message", message);

  switch (message.type) {
    case "process-message":
      return handleProcessMessage(message.data);
    default:
      console.error("[WORKER]", "Unknown message type", message.type);
      return;
  }
});

async function handleProcessMessage(eventData: Blob) {
  const gotEvent = performance.now();
  const buffer = new Uint8Array(
    await new Response(eventData as Blob).arrayBuffer()
  );
  const data = decodeCbor(buffer);
  const endDecode = performance.now();

  const validated = v1MessageSchema.safeParse(data);
  const endValidate = performance.now();

  console.log("[WORKER]", "Data parse timings", {
    decode: endDecode - gotEvent,
    validation: endValidate - endDecode,
    total: endValidate - gotEvent,
  });

  if (!validated.success) {
    console.error(validated.error);
    return;
  }

  postMessage({
    type: "processed-message",
    data: validated.data,
  });
}
