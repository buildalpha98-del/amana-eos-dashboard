/**
 * Standardised API error class.
 *
 * Throw from any API route handler wrapped with `withApiHandler()` or
 * `withApiAuth()` to return a consistent JSON error response.
 *
 * @example
 * ```ts
 * throw new ApiError(404, "Service not found");
 * throw new ApiError(400, "Validation failed", parsed.error.flatten());
 * throw ApiError.badRequest("Invalid date");
 * ```
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message = "Bad request", details?: unknown) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }

  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }

  static conflict(message = "Conflict") {
    return new ApiError(409, message);
  }
}

/**
 * Safely parse JSON from a NextRequest body.
 *
 * Returns the parsed body, or throws `ApiError(400)` with a clear message
 * if the body is missing or contains malformed JSON.
 *
 * Use this instead of raw `req.json()` to prevent unhandled parse errors
 * from returning 500 instead of 400.
 *
 * @example
 * ```ts
 * const body = await parseJsonBody(req);
 * const parsed = mySchema.safeParse(body);
 * ```
 */
export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw ApiError.badRequest("Invalid or missing JSON body");
  }
}
