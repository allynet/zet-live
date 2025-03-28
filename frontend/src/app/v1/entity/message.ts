import { z } from "zod";

export const v1MessageSchema = z.object({
  v: z.literal(1),
  ts: z.number().optional(),
  d: z
    .object({
      vehicles: z.array(
        z.tuple([z.number(), z.number(), z.string(), z.number(), z.number()])
      ),
    })
    .or(z.number()),
});

export type V1Message = z.infer<typeof v1MessageSchema>;
