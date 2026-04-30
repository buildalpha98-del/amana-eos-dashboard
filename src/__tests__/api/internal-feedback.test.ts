import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "@/__tests__/helpers/prisma-mock";
import { mockSession, type MockUserRole } from "@/__tests__/helpers/auth-mock";
import { createRequest } from "@/__tests__/helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { GET } from "@/app/api/internal-feedback/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/internal-feedback — role enforcement", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["member", 403],
    ["member", 403],
    ["staff", 403],
    ["marketing", 403],
  ])("returns %i for role %s", async (role, expected) => {
    mockSession({ id: "u1", name: "Test User", role: role as MockUserRole });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });

    const req = createRequest("GET", "/api/internal-feedback");
    const res = await GET(req);
    expect(res.status).toBe(expected);
  });
});

describe("GET /api/internal-feedback — pagination + filters", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it("returns paginated feedback (default page 1, limit 50)", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: `fb-${i}`,
      category: "bug",
      status: "new",
      message: `msg ${i}`,
      createdAt: new Date(),
      author: { id: "u2", name: "Reporter", email: "r@a.com", role: "staff" },
    }));
    prismaMock.internalFeedback.findMany.mockResolvedValue(rows);
    prismaMock.internalFeedback.count.mockResolvedValue(127);

    const req = createRequest("GET", "/api/internal-feedback");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.feedback).toHaveLength(50);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(50);
    expect(data.total).toBe(127);
    expect(data.totalPages).toBe(3);
  });

  it("filters by status", async () => {
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/internal-feedback?status=resolved");
    await GET(req);

    const callArgs = prismaMock.internalFeedback.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ status: "resolved" });
  });

  it("filters by category", async () => {
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/internal-feedback?category=bug");
    await GET(req);
    const callArgs = prismaMock.internalFeedback.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ category: "bug" });
  });

  it("rejects invalid page (negative, non-numeric) → defaults to 1", async () => {
    prismaMock.internalFeedback.findMany.mockResolvedValue([]);
    prismaMock.internalFeedback.count.mockResolvedValue(0);

    const req = createRequest("GET", "/api/internal-feedback?page=-5");
    const res = await GET(req);
    const data = await res.json();
    expect(data.page).toBe(1);
  });
});
