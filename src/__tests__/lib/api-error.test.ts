import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { withApiHandler, handleApiError } from "@/lib/api-handler";

// ── 1. ApiError class ─────────────────────────────────────

describe("ApiError", () => {
  describe("constructor", () => {
    it("sets status, message, and details", () => {
      const details = { field: "email", reason: "invalid" };
      const err = new ApiError(422, "Validation failed", details);

      expect(err.status).toBe(422);
      expect(err.message).toBe("Validation failed");
      expect(err.details).toEqual(details);
      expect(err.name).toBe("ApiError");
    });

    it("details are optional", () => {
      const err = new ApiError(500, "Something broke");

      expect(err.status).toBe(500);
      expect(err.message).toBe("Something broke");
      expect(err.details).toBeUndefined();
    });

    it("is an instance of Error", () => {
      const err = new ApiError(400, "Bad");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
    });
  });

  describe(".badRequest()", () => {
    it("creates a 400 error with default message", () => {
      const err = ApiError.badRequest();
      expect(err.status).toBe(400);
      expect(err.message).toBe("Bad request");
      expect(err.details).toBeUndefined();
    });

    it("accepts a custom message", () => {
      const err = ApiError.badRequest("Invalid date format");
      expect(err.status).toBe(400);
      expect(err.message).toBe("Invalid date format");
    });

    it("accepts details", () => {
      const details = { fields: ["name", "email"] };
      const err = ApiError.badRequest("Validation failed", details);
      expect(err.status).toBe(400);
      expect(err.details).toEqual(details);
    });
  });

  describe(".unauthorized()", () => {
    it("creates a 401 error with default message", () => {
      const err = ApiError.unauthorized();
      expect(err.status).toBe(401);
      expect(err.message).toBe("Unauthorized");
    });

    it("accepts a custom message", () => {
      const err = ApiError.unauthorized("Token expired");
      expect(err.status).toBe(401);
      expect(err.message).toBe("Token expired");
    });
  });

  describe(".forbidden()", () => {
    it("creates a 403 error with default message", () => {
      const err = ApiError.forbidden();
      expect(err.status).toBe(403);
      expect(err.message).toBe("Forbidden");
    });

    it("accepts a custom message", () => {
      const err = ApiError.forbidden("Insufficient permissions");
      expect(err.status).toBe(403);
      expect(err.message).toBe("Insufficient permissions");
    });
  });

  describe(".notFound()", () => {
    it("creates a 404 error with default message", () => {
      const err = ApiError.notFound();
      expect(err.status).toBe(404);
      expect(err.message).toBe("Not found");
    });

    it("accepts a custom message", () => {
      const err = ApiError.notFound("Service not found");
      expect(err.status).toBe(404);
      expect(err.message).toBe("Service not found");
    });
  });

  describe(".conflict()", () => {
    it("creates a 409 error", () => {
      const err = ApiError.conflict();
      expect(err.status).toBe(409);
      expect(err.message).toBe("Conflict");
    });
  });
});

// ── 1b. parseJsonBody ─────────────────────────────────────

describe("parseJsonBody", () => {
  it("parses valid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ name: "test" });
  });

  it("throws ApiError(400) for malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
      body: "this is not json{{{",
      headers: { "Content-Type": "application/json" },
    });

    try {
      await parseJsonBody(req);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).message).toContain("Invalid or missing JSON");
    }
  });

  it("throws ApiError(400) for empty body", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      method: "POST",
    });

    try {
      await parseJsonBody(req);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
    }
  });
});

// ── 2. withApiHandler wrapper ─────────────────────────────

describe("withApiHandler", () => {
  const mockReq = new NextRequest("http://localhost/api/test", { method: "GET" });

  it("returns handler response on success", async () => {
    const handler = withApiHandler(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as never;
    });

    const { NextResponse } = await import("next/server");
    const wrappedHandler = withApiHandler(async () => {
      return NextResponse.json({ ok: true });
    });

    const res = await wrappedHandler(mockReq);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("catches ApiError and returns JSON with correct status and message", async () => {
    const handler = withApiHandler(async () => {
      throw ApiError.notFound("User not found");
    });

    const res = await handler(mockReq);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("User not found");
    expect(body.details).toBeUndefined();
  });

  it("catches ApiError with details and includes them in response", async () => {
    const details = { field: "email", issue: "already taken" };
    const handler = withApiHandler(async () => {
      throw ApiError.badRequest("Validation failed", details);
    });

    const res = await handler(mockReq);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toEqual(details);
  });

  it("catches unknown errors and returns 500 with generic message", async () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = withApiHandler(async () => {
      throw new Error("Database connection lost");
    });

    const res = await handler(mockReq);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Internal server error");

    consoleSpy.mockRestore();
  });

  it("does not leak error details for unknown errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = withApiHandler(async () => {
      throw new Error("secret database password in error message");
    });

    const res = await handler(mockReq);
    const body = await res.json();

    expect(body.error).toBe("Internal server error");
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("database");

    consoleSpy.mockRestore();
  });

  it("returns 504 when handler exceeds timeout", async () => {
    const handler = withApiHandler(
      async () => {
        // Simulate a handler that never resolves within timeout
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return NextResponse.json({ ok: true });
      },
      { timeoutMs: 50 },
    );

    const res = await handler(mockReq);
    expect(res.status).toBe(504);

    const body = await res.json();
    expect(body.error).toBe("Request timed out");
  });

  it("sets x-request-id header on all responses", async () => {
    const handler = withApiHandler(async () =>
      NextResponse.json({ ok: true }),
    );

    const res = await handler(mockReq);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("x-request-id")!.length).toBe(8);
  });
});

// ── 3. handleApiError ─────────────────────────────────────

describe("handleApiError", () => {
  const mockReq = new NextRequest("http://localhost/api/test", { method: "POST" });

  it("returns proper JSON for ApiError instances", async () => {
    const err = new ApiError(409, "Conflict", { id: "123" });
    const res = handleApiError(mockReq, err);

    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toBe("Conflict");
    expect(body.details).toEqual({ id: "123" });
  });

  it("returns 500 for non-ApiError errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = handleApiError(mockReq, new TypeError("Cannot read property"));

    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.details).toBeUndefined();

    consoleSpy.mockRestore();
  });

  it("returns 500 for non-Error thrown values", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = handleApiError(mockReq, "string error");

    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe("Internal server error");

    consoleSpy.mockRestore();
  });

  it("omits details field when ApiError has no details", async () => {
    const err = ApiError.unauthorized();
    const res = handleApiError(mockReq, err);

    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect("details" in body).toBe(false);
  });
});
