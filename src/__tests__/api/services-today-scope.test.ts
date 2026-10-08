import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

import { GET } from "@/app/api/services/[id]/today/route";

/**
 * The centre "Today" snapshot lists the centre's staff and to-dos. It had
 * no centre-scope check at all, so any signed-in user could read any
 * centre's — 2026-10-09.
 */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/services/[id]/today — centre scope", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
    prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
    prismaMock.service.findMany.mockResolvedValue([]);
  });

  it("refuses an educator looking at another centre", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-mine" });
    const res = await GET(createRequest("GET", "/api/services/svc-other/today"), ctx("svc-other"));
    expect(res.status).toBe(403);
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });

  it("lets an educator see their own centre", async () => {
    mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-mine" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "/api/services/svc-mine/today"), ctx("svc-mine"));
    // Past the scope gate — the (mocked) missing service is what answers.
    expect(res.status).toBe(404);
  });
});
