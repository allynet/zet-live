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
    .or(
      z.object({
        stopIds: z.array(z.string()),
        route: z.array(z.tuple([z.number(), z.number()])),
      })
    )
    .or(
      z.object({
        simpleStops: z.array(
          z.tuple([z.string(), z.string(), z.number(), z.number()])
        ),
      })
    )
    .or(
      z.object({
        stopTrips: z.array(z.string()),
      })
    )
);

export type V1Message = z.infer<typeof v1MessageSchema>;
