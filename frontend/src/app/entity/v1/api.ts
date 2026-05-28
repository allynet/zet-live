import { z } from "zod";

const stopTimeSchema = z.object({
  stopId: z.string(),
  stopSequence: z.number(),
  stopName: z.string(),
  arrivalTime: z.number().nullable(),
});

const stopTimeSimpleSchema = z.object({
  stopId: z.string(),
  arrivalTime: z.number().nullable(),
});

const stopArrivalTimeSchema = z.object({
  tripId: z.string(),
  vehicleId: z.string(),
  routeId: z.string(),
  stopId: z.string(),
  arrivalTime: z.number().nullable(),
});

export const tripInfoResponseSchema = z.object({
  d: z.object({
    stopIds: z.array(z.string()),
    route: z.array(z.tuple([z.number(), z.number()])),
    stopTimes: z.array(stopTimeSchema),
  }),
});

export const tripStopTimesResponseSchema = z.object({
  d: z.object({
    stopTimes: z.array(stopTimeSimpleSchema),
  }),
});

export const stopArrivalsResponseSchema = z.object({
  d: z.object({
    arrivalTimes: z.array(stopArrivalTimeSchema),
  }),
});

export const stopTripsResponseSchema = z.object({
  d: z.object({
    stopTrips: z.array(z.string()),
    arrivalTimes: z.array(stopArrivalTimeSchema),
  }),
});

export function parseResponse<T>(data: unknown, schema: z.ZodType<T>): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("API response validation failed", result.error);
    return null;
  }
  return result.data;
}
