import { isErr, try$ } from "@allynet/ishod";
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

export const stopArrivalTimeSchema = z.object({
  tripId: z.string(),
  vehicleId: z.string(),
  routeId: z.string(),
  stopId: z.string(),
  arrivalTime: z.number().nullable(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  status: z.number(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

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

export type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };

export function parseResponse<T>(data: unknown, schema: z.ZodType<T>): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("API response validation failed", result.error);
    return null;
  }
  return result.data;
}

export async function apiFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const resp = await try$(fetch(url, options));
  if (isErr(resp)) {
    return {
      data: null,
      error: { error: "Network error", status: 0 },
    };
  }

  const respJson = await try$(resp.data.json());
  if (isErr(respJson)) {
    return {
      data: null,
      error: { error: `Failed to parse response body as JSON: ${respJson.error}`, status: 0 },
    };
  }

  const apiSchema = await z.union([apiErrorSchema, schema]).safeParseAsync(respJson.data);

  if (!apiSchema.success) {
    return {
      data: null,
      error: { error: `Response validation failed: ${apiSchema.error.message}`, status: 0 },
    };
  }

  if (apiSchema.data && typeof apiSchema.data === "object" && "error" in apiSchema.data) {
    return {
      data: null,
      error: apiSchema.data,
    };
  }

  return {
    data: apiSchema.data,
    error: null,
  };
}
