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
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
  });

  it.each([
    ["owner", 200],
    ["head_office", 200],
    ["admin", 200],
    ["coordinator", 403],
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
