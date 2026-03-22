/**
 * Shared fetch wrapper for React Query hooks.
 *
 * Replaces the `fetch() → if (!ok) throw` boilerplate with:
 * - Meaningful error messages (includes status, URL, server error)
 * - Configurable timeout (default 30s)
 * - Typed JSON response
 *
 * @example
 * ```ts
 * // Before (generic error, no context):
 * const res = await fetch("/api/services");
 * if (!res.ok) throw new Error("Failed to fetch services");
 * return res.json();
 *
 * // After (rich error context):
 * return fetchApi<Service[]>("/api/services");
 * ```
 */

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
    public serverError?: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

interface FetchApiOptions extends Omit<RequestInit, "signal"> {
  /** Timeout in milliseconds. Default: 30000 (30s). Set 0 to disable. */
  timeoutMs?: number;
}

/**
 * Fetch a JSON API endpoint with error context and timeout.
 *
 * On success, returns parsed JSON of type `T`.
 * On failure, throws `ApiResponseError` with status, URL, and server error message.
 */
export async function fetchApi<T = unknown>(
  url: string,
  options?: FetchApiOptions,
): Promise<T> {
  const { timeoutMs = 30_000, ...fetchInit } = options ?? {};

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const res = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });

    if (!res.ok) {
      let serverError: string | undefined;
      try {
        const body = await res.json();
        serverError = body?.error ?? body?.message ?? JSON.stringify(body);
      } catch {
        // Response body wasn't JSON — ignore
      }

      throw new ApiResponseError(
        serverError ?? `Request failed with status ${res.status}`,
        res.status,
        url,
        serverError,
      );
    }

    // 204 No Content or empty body — parse safely
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return null as T;
    }

    // Guard against non-JSON responses (e.g. HTML error pages from proxies)
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new ApiResponseError(
        `Expected JSON response but got ${contentType || "no content-type"}`,
        res.status,
        url,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiResponseError) throw err;

    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiResponseError(
        `Request timed out after ${timeoutMs}ms`,
        408,
        url,
      );
    }

    // Network error (offline, DNS failure, etc.)
    throw new ApiResponseError(
      err instanceof Error ? err.message : "Network error",
      0,
      url,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * POST/PATCH/PUT/DELETE JSON to an API endpoint.
 *
 * Convenience wrapper that sets Content-Type and stringifies the body.
 *
 * @example
 * ```ts
 * const result = await mutateApi<Service>("/api/services", {
 *   method: "POST",
 *   body: { name: "New Centre", code: "NC" },
 * });
 * ```
 */
export async function mutateApi<T = unknown>(
  url: string,
  options: Omit<FetchApiOptions, "body"> & {
    method: "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
  },
): Promise<T> {
  const { body, ...rest } = options;
  return fetchApi<T>(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...rest.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
