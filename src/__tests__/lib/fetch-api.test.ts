import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ name: "test" }));

    const result = await fetchApi<{ name: string }>("/api/test");

    expect(result).toEqual({ name: "test" });
    expect(mockFetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({}));
  });

  it("throws ApiResponseError with status and server error on non-ok response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "Not found" }, 404));

    try {
      await fetchApi("/api/missing");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiResponseError);
      const apiErr = err as ApiResponseError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.url).toBe("/api/missing");
      expect(apiErr.serverError).toBe("Not found");
      expect(apiErr.message).toBe("Not found");
    }
  });

  it("includes status in message when no server error message", async () => {
    mockFetch.mockResolvedValue(new Response("Not JSON", { status: 500 }));

    try {
      await fetchApi("/api/broken");
    } catch (err) {
      const apiErr = err as ApiResponseError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toContain("500");
    }
  });

  it("throws timeout error when request exceeds timeoutMs", async () => {
    // Mock fetch that respects AbortSignal
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => {
          const err = new DOMException("The operation was aborted.", "AbortError");
          reject(err);
        };
        if (init?.signal?.aborted) {
          onAbort();
          return;
        }
        init?.signal?.addEventListener("abort", onAbort);
      });
    });

    try {
      await fetchApi("/api/slow", { timeoutMs: 50 });
      expect.unreachable("should have thrown");
    } catch (err) {
      const apiErr = err as ApiResponseError;
      expect(apiErr.status).toBe(408);
      expect(apiErr.message).toContain("timed out");
    }
  });

  it("throws on network error with status 0", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    try {
      await fetchApi("/api/offline");
    } catch (err) {
      const apiErr = err as ApiResponseError;
      expect(apiErr.status).toBe(0);
      expect(apiErr.message).toBe("Failed to fetch");
    }
  });

  it("handles 204 No Content without crashing", async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    const result = await fetchApi("/api/items/1");
    expect(result).toBeNull();
  });

  it("handles empty body with content-length 0", async () => {
    mockFetch.mockResolvedValue(
      new Response("", { status: 200, headers: { "content-length": "0" } }),
    );

    const result = await fetchApi("/api/empty");
    expect(result).toBeNull();
  });

  it("passes through fetch options", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await fetchApi("/api/test", {
      headers: { Authorization: "Bearer xyz" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: { Authorization: "Bearer xyz" },
      }),
    );
  });

  it("reads message field from error response", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ message: "Validation failed" }, 400),
    );

    try {
      await fetchApi("/api/validate");
    } catch (err) {
      expect((err as ApiResponseError).serverError).toBe("Validation failed");
    }
  });
});

describe("mutateApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends JSON body with correct headers", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: "new-1" }, 201));

    const result = await mutateApi<{ id: string }>("/api/items", {
      method: "POST",
      body: { name: "Test" },
    });

    expect(result).toEqual({ id: "new-1" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Test" }),
      }),
    );
  });

  it("handles DELETE with no body", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));

    await mutateApi("/api/items/1", { method: "DELETE" });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/items/1",
      expect.objectContaining({
        method: "DELETE",
        body: undefined,
      }),
    );
  });

  it("propagates error from fetchApi", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));

    await expect(
      mutateApi("/api/admin", { method: "PATCH", body: { role: "admin" } }),
    ).rejects.toThrow(ApiResponseError);
  });
});

describe("ApiResponseError", () => {
  it("has correct name and properties", () => {
    const err = new ApiResponseError("test error", 422, "/api/test", "detail");

    expect(err.name).toBe("ApiResponseError");
    expect(err.message).toBe("test error");
    expect(err.status).toBe(422);
    expect(err.url).toBe("/api/test");
    expect(err.serverError).toBe("detail");
    expect(err).toBeInstanceOf(Error);
  });
});
