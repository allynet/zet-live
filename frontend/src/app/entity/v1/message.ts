import { z } from "zod";
import { versionedSchema } from "../versioned";

export const v1MessageSchema = versionedSchema(
  1,
  z
    .object({
      vehicles: z.array(
        z.tuple([z.string(), z.string(), z.string(), z.number(), z.number()])
      ),
    })
    .or(z.number())
);

export type V1Message = z.infer<typeof v1MessageSchema>;
