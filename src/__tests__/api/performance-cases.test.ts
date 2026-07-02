/**
 * Auth + visibility tests for /api/performance-cases.
 *
 * Critical paths to lock down:
 *   - staff/member roles can't read or write
 *   - admin/head_office can read non-confidential
 *   - confidential cases are owner-only on both list + single
 *   - DELETE is owner-only
 *   - PATCH that closes a case stamps closedAt + closedById
 *   - Soft-delete (deleted=true) hides from list responses
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

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
  generateRequestId: () => "test-req",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET, POST } from "@/app/api/performance-cases/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/performance-cases/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const baseCase = {
  id: "case-1",
  userId: "subject-1",
  raisedById: "admin-1",
  closedById: null,
  type: "verbal_warning",
  status: "open",
  title: "Late arrivals",
  summary: "Discussed pattern of late starts in March.",
  occurredAt: new Date("2026-04-10"),
  followUpAt: null,
  outcome: null,
  closedAt: null,
  fileUrl: null,
  fileName: null,
  confidential: false,
  deleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: "subject-1", name: "Subject" },
  raisedBy: { id: "admin-1", name: "Admin" },
  closedBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    serviceId: "svc-1",
  });
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("GET /api/performance-cases — auth + visibility", () => {
  it("rejects unauthenticated requests", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/performance-cases?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(401);
  });

  it("rejects staff role", async () => {
    mockSession({ id: "staff-1", name: "Staff", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/performance-cases?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("rejects member role (coordinator)", async () => {
    mockSession({ id: "co-1", name: "Coordinator", role: "member" });
    const res = await GET(
      createRequest("GET", "/api/performance-cases?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });

  it("admin gets non-confidential cases only (confidential filter applied)", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceCase.findMany.mockResolvedValue([baseCase]);
    const res = await GET(
      createRequest("GET", "/api/performance-cases?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    // Check the where clause excluded confidential for non-owner role.
    const call = prismaMock.performanceCase.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      userId: "subject-1",
      deleted: false,
      confidential: false,
    });
  });

  it("owner sees ALL cases including confidential (no filter)", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.performanceCase.findMany.mockResolvedValue([baseCase]);
    await GET(
      createRequest("GET", "/api/performance-cases?userId=subject-1"),
      { params: Promise.resolve({}) },
    );
    const call = prismaMock.performanceCase.findMany.mock.calls[0]?.[0];
    // Owner must NOT have a `confidential: false` clause in their where.
    expect(call?.where).toMatchObject({
      userId: "subject-1",
      deleted: false,
    });
    expect(
      (call?.where as Record<string, unknown>)?.confidential,
    ).toBeUndefined();
  });

  it("returns 400 when userId is missing", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await GET(createRequest("GET", "/api/performance-cases"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/performance-cases", () => {
  beforeEach(() => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      // server-auth's first user.findUnique call (active+serviceId)
      active: true,
      serviceId: "svc-1",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      // POST's subject lookup
      id: "subject-1",
      name: "Subject",
    });
    prismaMock.performanceCase.create.mockResolvedValue(baseCase);
  });

  it("creates a case + records ActivityLog", async () => {
    const res = await POST(
      createRequest("POST", "/api/performance-cases", {
        body: {
          userId: "subject-1",
          type: "verbal_warning",
          title: "Late arrivals",
          summary: "Discussed pattern of late starts in March.",
          occurredAt: "2026-04-10",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(prismaMock.performanceCase.create).toHaveBeenCalled();
    expect(prismaMock.activityLog.create).toHaveBeenCalled();
    const logCall = prismaMock.activityLog.create.mock.calls[0]?.[0];
    expect(logCall?.data.action).toBe("performance_case_created");
  });

  it("validates required fields", async () => {
    const res = await POST(
      createRequest("POST", "/api/performance-cases", {
        body: { userId: "subject-1" }, // missing type, title, summary, occurredAt
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid type enum", async () => {
    const res = await POST(
      createRequest("POST", "/api/performance-cases", {
        body: {
          userId: "subject-1",
          type: "made_up_type",
          title: "x",
          summary: "y",
          occurredAt: "2026-04-10",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/performance-cases/[id]", () => {
  it("admin role can read a non-confidential case", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceCase.findUnique.mockResolvedValue(baseCase);
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("admin role gets 403 on confidential cases", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceCase.findUnique.mockResolvedValue({
      ...baseCase,
      confidential: true,
    });
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("owner role can read confidential cases", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.performanceCase.findUnique.mockResolvedValue({
      ...baseCase,
      confidential: true,
    });
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for soft-deleted cases", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.performanceCase.findUnique.mockResolvedValue({
      ...baseCase,
      deleted: true,
    });
    const res = await GET_ONE(
      createRequest("GET", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/performance-cases/[id]", () => {
  beforeEach(() => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceCase.findUnique.mockResolvedValue(baseCase);
    prismaMock.performanceCase.update.mockResolvedValue({
      ...baseCase,
      status: "resolved",
      closedAt: new Date(),
      closedById: "admin-1",
    });
  });

  it("auto-stamps closedAt + closedById when status moves to resolved", async () => {
    const res = await PATCH(
      createRequest("PATCH", "/api/performance-cases/case-1", {
        body: { status: "resolved", outcome: "Verbal apology accepted." },
      }),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.performanceCase.update.mock.calls[0]?.[0];
    expect(updateCall?.data.closedAt).toBeInstanceOf(Date);
    expect(updateCall?.data.closedById).toBe("admin-1");
  });

  it("clears closure stamps when re-opening a closed case", async () => {
    prismaMock.performanceCase.findUnique.mockResolvedValue({
      ...baseCase,
      status: "resolved",
      closedAt: new Date("2026-05-01"),
      closedById: "admin-1",
    });
    await PATCH(
      createRequest("PATCH", "/api/performance-cases/case-1", {
        body: { status: "in_progress" },
      }),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    const updateCall = prismaMock.performanceCase.update.mock.calls[0]?.[0];
    expect(updateCall?.data.closedAt).toBeNull();
    expect(updateCall?.data.closedById).toBeNull();
  });
});

describe("DELETE /api/performance-cases/[id] — owner only", () => {
  it("admin role is 403'd", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.performanceCase.findUnique.mockResolvedValue(baseCase);
    const res = await DELETE(
      createRequest("DELETE", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("head_office is 403'd", async () => {
    mockSession({ id: "ho-1", name: "HO", role: "head_office" });
    prismaMock.performanceCase.findUnique.mockResolvedValue(baseCase);
    const res = await DELETE(
      createRequest("DELETE", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("owner can soft-delete (sets deleted=true, doesn't physically remove)", async () => {
    mockSession({ id: "owner-1", name: "Owner", role: "owner" });
    prismaMock.performanceCase.findUnique.mockResolvedValue(baseCase);
    prismaMock.performanceCase.update.mockResolvedValue({
      ...baseCase,
      deleted: true,
    });
    const res = await DELETE(
      createRequest("DELETE", "/api/performance-cases/case-1"),
      { params: Promise.resolve({ id: "case-1" }) },
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.performanceCase.update.mock.calls[0]?.[0];
    expect(updateCall?.data.deleted).toBe(true);
    // Verify NO physical delete happened.
    expect(prismaMock.performanceCase.delete).not.toHaveBeenCalled();
  });
});
