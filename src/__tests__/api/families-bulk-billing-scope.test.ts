/**
 * Bulk billing, scoped to one centre.
 *
 * The property that matters: pressing "all families" from a service's
 * billing page must never reach a family at another centre. That's the
 * one mistake in this endpoint you can't undo from the UI.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

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
    static notFound(message = "Not found") {
      return new ApiError(404, message);
    }
    static forbidden(message = "Forbidden") {
      return new ApiError(403, message);
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
    handleApiError: vi.fn((_req: unknown, err: unknown) => {
      return NextResponse.json(
        { error: (err as any)?.message || "Internal error" },
        { status: (err as any)?.statusCode || 500 },
      );
    }),
  };
});

import { POST } from "@/app/api/families/bulk-billing/route";

const call = (body: unknown) =>
  POST(
    createRequest("POST", "/api/families/bulk-billing", { body: body as never }),
    undefined as never,
  );

describe("POST /api/families/bulk-billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.parentAccount.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.activityLog.create.mockResolvedValue({});
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      {
        primaryParent: { email: "Here@Example.com " },
        childRecords: [{ serviceId: "svc-1", status: "active" }],
      },
      {
        primaryParent: { email: "elsewhere@example.com" },
        childRecords: [{ serviceId: "svc-2", status: "active" }],
      },
      {
        // Withdrawn from svc-1 — no longer this centre's family.
        primaryParent: { email: "gone@example.com" },
        childRecords: [{ serviceId: "svc-1", status: "withdrawn" }],
      },
    ]);
    prismaMock.parentAccount.findMany.mockResolvedValue([{ id: "fam-here" }]);
  });

  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    expect(
      (await call({ allActive: true, billingAnchorDay: 3 })).status,
    ).toBe(401);
  });

  it("refuses an empty selection that isn't an explicit 'all'", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    const res = await call({ familyIds: [], billingAnchorDay: 3 });
    expect(res.status).toBe(400);
    expect(prismaMock.parentAccount.updateMany).not.toHaveBeenCalled();
  });

  it("confines 'all families' to the given service", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    const res = await call({
      allActive: true,
      serviceId: "svc-1",
      billingFrequency: "weekly",
      billingAnchorDay: 3,
    });
    expect(res.status).toBe(200);

    // Only the family with an ACTIVE child at svc-1, matched
    // case-insensitively against the JSON blob.
    expect(prismaMock.parentAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { in: ["here@example.com"] } },
      }),
    );
    expect(prismaMock.parentAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["fam-here"] } } }),
    );
  });

  it("writes nothing when a service has no families", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    prismaMock.parentAccount.findMany.mockResolvedValue([]);
    const res = await call({
      allActive: true,
      serviceId: "svc-empty",
      billingAnchorDay: 3,
    });
    const body = await res.json();
    expect(body.updated).toBe(0);
    // An unscoped updateMany here would have rewritten every family.
    expect(prismaMock.parentAccount.updateMany).not.toHaveBeenCalled();
  });

  it("still supports an org-wide apply when no service is given", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    await call({ allActive: true, billingAnchorDay: 3 });
    expect(prismaMock.parentAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
