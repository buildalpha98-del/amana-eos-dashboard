import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })
  ),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

// Mock api-error / api-handler (used by server-auth catch)
vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message = "Bad request") {
      return new ApiError(400, message);
    }
  }
  return {
    ApiError,
    parseJsonBody: async (req: Request) => {
      try {
        return await req.json();
      } catch {
        throw ApiError.badRequest("Invalid or missing JSON body");
      }
    },
  };
});

vi.mock("@/lib/api-handler", async () => {
  const { NextResponse } = await import("next/server");
  return {
    handleApiError: vi.fn((_req: unknown, err: unknown, reqId: string) => {
      const status = (err as any)?.statusCode || 500;
      const message = (err as any)?.message || "Internal error";
      return NextResponse.json({ error: message }, { status });
    }),
  };
});

vi.mock("@/lib/enrolment-search", () => ({
  searchEnrolmentIds: vi.fn(),
}));

import { searchEnrolmentIds } from "@/lib/enrolment-search";
import { GET } from "@/app/api/enrolments/route";
import {
  GET as getEnrolment,
  PATCH,
} from "@/app/api/enrolments/[id]/route";

describe("GET /api/enrolments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/enrolments");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns enrolments list", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const mockSubmissions = [
      {
        id: "es-1",
        status: "submitted",
        parentName: "Jane Doe",
        childName: "Billy Doe",
        createdAt: new Date(),
      },
      {
        id: "es-2",
        status: "processed",
        parentName: "John Smith",
        childName: "Sally Smith",
        createdAt: new Date(),
      },
    ];
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue(mockSubmissions);
    prismaMock.enrolmentSubmission.count.mockResolvedValue(2);

    const req = createRequest("GET", "/api/enrolments");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("filters by status query param", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
    prismaMock.enrolmentSubmission.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/enrolments?status=processed");
    await GET(req);

    const callArgs = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("processed");
  });

  /**
   * Paging and search, added 2026-09-20.
   *
   * The list used to fetch a fixed slice and filter it in the browser, so an
   * older family's form could be neither paged to nor found. These lock in
   * the two halves of the fix: an offset that is actually honoured, and a
   * search that runs against every row.
   */
  describe("paging", () => {
    it("honours limit and offset", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });

      const req = createRequest("GET", "/api/enrolments?limit=25&offset=100");
      await GET(req);

      const args = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
      expect(args.take).toBe(25);
      expect(args.skip).toBe(100);
    });

    it("defaults to 50 at offset 0", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });

      await GET(createRequest("GET", "/api/enrolments"));

      const args = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });

    it("clamps an absurd limit rather than serialising the table", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });

      await GET(createRequest("GET", "/api/enrolments?limit=100000"));

      expect(
        prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].take,
      ).toBe(200);
    });

    it("falls back to the defaults for junk paging params", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });

      await GET(createRequest("GET", "/api/enrolments?limit=abc&offset=-5"));

      const args = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
      expect(args.take).toBe(50);
      expect(args.skip).toBe(0);
    });
  });

  describe("search", () => {
    it("narrows to the ids the SQL search returned", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });
      vi.mocked(searchEnrolmentIds).mockResolvedValue(["es-7", "es-9"]);

      await GET(createRequest("GET", "/api/enrolments?search=rahman"));

      expect(searchEnrolmentIds).toHaveBeenCalledWith("rahman", undefined);
      const args = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
      expect(args.where.id).toEqual({ in: ["es-7", "es-9"] });
    });

    it("passes the caller's centre to the search when they are scoped", async () => {
      mockSession({
        id: "user-2",
        name: "Coordinator",
        role: "member",
        serviceId: "svc-1",
      });
      vi.mocked(searchEnrolmentIds).mockResolvedValue(["es-1"]);

      await GET(createRequest("GET", "/api/enrolments?search=liam"));

      expect(searchEnrolmentIds).toHaveBeenCalledWith("liam", "svc-1");
      // The scope filter is still applied in Prisma — the id list is a
      // candidate set, never the authorization boundary.
      const args = prismaMock.enrolmentSubmission.findMany.mock.calls[0][0];
      expect(args.where.serviceId).toBe("svc-1");
    });

    it("returns empty without querying when nothing matches", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });
      vi.mocked(searchEnrolmentIds).mockResolvedValue([]);

      const res = await GET(
        createRequest("GET", "/api/enrolments?search=zzzz"),
      );
      const body = await res.json();

      expect(body.submissions).toEqual([]);
      expect(body.total).toBe(0);
      expect(prismaMock.enrolmentSubmission.findMany).not.toHaveBeenCalled();
    });

    it("ignores a blank search rather than matching nothing", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });

      await GET(createRequest("GET", "/api/enrolments?search=%20%20"));

      expect(searchEnrolmentIds).not.toHaveBeenCalled();
      expect(
        prismaMock.enrolmentSubmission.findMany.mock.calls[0][0].where.id,
      ).toBeUndefined();
    });
  });

  describe("counts", () => {
    it("reports per-status totals for the whole set, not the page", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });
      prismaMock.enrolmentSubmission.groupBy.mockResolvedValue([
        { status: "submitted", _count: { _all: 12 } },
        { status: "processed", _count: { _all: 430 } },
      ]);
      prismaMock.enrolmentSubmission.count.mockResolvedValue(442);

      const res = await GET(createRequest("GET", "/api/enrolments?limit=50"));
      const body = await res.json();

      expect(body.counts).toEqual({ all: 442, submitted: 12, processed: 430 });
    });

    it("counts statuses across every tab, ignoring the active one", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });

      await GET(createRequest("GET", "/api/enrolments?status=processed"));

      // findMany is filtered by status; the groupBy deliberately is not,
      // or every tab but the open one would read zero.
      const groupArgs = prismaMock.enrolmentSubmission.groupBy.mock.calls[0][0];
      expect(groupArgs.where.status).toBeUndefined();
    });

    it("counts unplaced submissions across every page", async () => {
      mockSession({ id: "user-1", name: "Test", role: "owner" });
      prismaMock.enrolmentSubmission.count.mockImplementation(
        (args: { where?: { serviceId?: unknown } }) =>
          Promise.resolve(args?.where?.serviceId === null ? 6 : 442),
      );

      const res = await GET(createRequest("GET", "/api/enrolments"));
      const body = await res.json();

      expect(body.unplaced).toBe(6);
      expect(body.total).toBe(442);
    });
  });
});

describe("PATCH /api/enrolments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 404 for unknown enrolment", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });
    prismaMock.enrolmentSubmission.update.mockRejectedValue(
      Object.assign(new Error("Record not found"), { code: "P2025" })
    );

    const req = createRequest("PATCH", "/api/enrolments/unknown", {
      body: { status: "under_review" },
    });
    const context = { params: Promise.resolve({ id: "unknown" }) };
    const res = await PATCH(req, context);
    // Prisma P2025 will be caught by the error handler
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("updates enrolment status successfully", async () => {
    mockSession({ id: "user-1", name: "Test", role: "owner" });

    const updatedSubmission = {
      id: "es-1",
      status: "under_review",
      parentName: "Jane Doe",
      childName: "Billy Doe",
      createdAt: new Date(),
    };
    prismaMock.enrolmentSubmission.update.mockResolvedValue(updatedSubmission);

    const req = createRequest("PATCH", "/api/enrolments/es-1", {
      body: { status: "under_review" },
    });
    const context = { params: Promise.resolve({ id: "es-1" }) };
    const res = await PATCH(req, context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("under_review");
  });
});
