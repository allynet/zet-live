import { clearCredentials, getCredentials } from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super(401, "Unauthorized");
    this.name = "UnauthorizedError";
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

export class TypeErrorLike extends Error {}

interface FetchOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const creds = getCredentials();
  if (!creds) {
    throw new UnauthorizedError();
  }

  const { body, headers, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${creds.apiUrl}${path}`, init);
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? e.message : "Network error");
  }

  if (res.status === 401) {
    clearCredentials();
    unauthorizedHandler?.();
    throw new UnauthorizedError();
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      if (text) message = text;
    } catch {
      // ignore body read errors
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiFetch<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
