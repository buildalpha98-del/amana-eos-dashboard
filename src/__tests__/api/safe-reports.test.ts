/**
 * Critical-path tests for the anonymous safe-report channel.
 *
 * The thing that MUST be true:
 *   - POST works without any session (anyone can submit)
 *   - POST never persists session identifiers even when present
 *   - GET / PATCH are owner / head_office only — admin gets 403
 *   - Validation: short content rejected, unknown category rejected
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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 5, resetIn: 0 })),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve()),
}));

import { POST, GET } from "@/app/api/safe-reports/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findMany.mockResolvedValue([]); // no owners to email
  prismaMock.activityLog.create.mockResolvedValue({} as never);
});

describe("POST /api/safe-reports — unauthenticated intake", () => {
  it("accepts a submission with no session at all", async () => {
    mockNoSession();
    prismaMock.safeReport.create.mockResolvedValue({
      id: "r-1",
      createdAt: new Date(),
      category: "harassment",
    });
    const res = await POST(
      createRequest("POST", "/api/safe-reports", {
        body: {
          category: "harassment",
          content:
            "Sample report content that is at least twenty characters long.",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("r-1");
  });

  it("does NOT persist any session userId even when a session exists", async () => {
    mockSession({ id: "user-9", name: "Logged In", role: "staff" });
    prismaMock.safeReport.create.mockResolvedValue({
      id: "r-2",
      createdAt: new Date(),
      category: "harassment",
    });
    await POST(
      createRequest("POST", "/api/safe-reports", {
        body: {
          category: "harassment",
          content:
            "Sample report content that is at least twenty characters long.",
        },
      }),
      { params: Promise.resolve({}) },
    );
    // Check the create call — `data` must NOT include any userId / reporterId.
    const createCall = prismaMock.safeReport.create.mock.calls[0]?.[0];
    expect(createCall?.data).not.toHaveProperty("reporterId");
    expect(createCall?.data).not.toHaveProperty("userId");
    expect(createCall?.data).not.toHaveProperty("createdById");
    // And no ipAddress / userAgent leakage.
    expect(createCall?.data).not.toHaveProperty("ipAddress");
    expect(createCall?.data).not.toHaveProperty("userAgent");
  });

  it("rejects content shorter than 20 chars", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/safe-reports", {
        body: { category: "harassment", content: "too short" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown category", async () => {
    mockNoSession();
    const res = await POST(
      createRequest("POST", "/api/safe-reports", {
        body: {
          category: "made_up",
          content: "Sample report content that is at least twenty characters.",
        },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/safe-reports — owner/head_office only", () => {
  beforeEach(() => {
    prismaMock.safeReport.findMany.mockResolvedValue([]);
  });

  it("rejects unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/safe-reports"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(401);
  });

  it("rejects staff", async () => {
    mockSession({ id: "s-1", name: "Staff", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: "svc-1" });
    const res = await GET(createRequest("GET", "/api/safe-reports"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(403);
  });

  it("rejects admin (deliberately not in the allow list)", async () => {
    mockSession({ id: "a-1", name: "Admin", role: "admin" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: null });
    const res = await GET(createRequest("GET", "/api/safe-reports"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(403);
  });

  it("allows owner", async () => {
    mockSession({ id: "o-1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: null });
    const res = await GET(createRequest("GET", "/api/safe-reports"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
  });

  it("allows head_office", async () => {
    mockSession({ id: "h-1", name: "Head Office", role: "head_office" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, serviceId: null });
    const res = await GET(createRequest("GET", "/api/safe-reports"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
  });
});
