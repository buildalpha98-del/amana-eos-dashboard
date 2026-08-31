import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../../helpers/auth-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
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
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/lms/transcript/route";

const TARGET = { id: "u2", name: "Bilal Khan", email: "bilal@x.com" };

function routeFindUnique(target: typeof TARGET | null) {
  // The withApiAuth active-check and the route's target lookup both hit
  // user.findUnique — route by whether `name` was selected (route only).
  prismaMock.user.findUnique.mockImplementation((args: any) => {
    if (args?.select?.name) return Promise.resolve(target);
    return Promise.resolve({ active: true });
  });
}

describe("GET /api/lms/transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    routeFindUnique(TARGET);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      {
        status: "completed",
        completedAt: new Date("2026-06-10T00:00:00Z"),
        score: 92,
        course: { title: "Child Safety & You", track: "essential" },
      },
    ]);
  });

  it("401s when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/lms/transcript"));
    expect(res.status).toBe(401);
  });

  it("403s when a non-admin requests another user's transcript", async () => {
    mockSession({ id: "u1", name: "Staffer", role: "staff" });
    const res = await GET(
      createRequest("GET", "/api/lms/transcript?userId=u2"),
    );
    expect(res.status).toBe(403);
  });

  it("returns the caller's own transcript with mapped rows", async () => {
    mockSession({ id: "u2", name: "Bilal Khan", role: "staff" });
    const res = await GET(createRequest("GET", "/api/lms/transcript"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.learnerName).toBe("Bilal Khan");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      courseTitle: "Child Safety & You",
      status: "completed",
      score: 92,
      completedAt: "2026-06-10T00:00:00.000Z",
    });
  });

  it("lets an admin fetch another user's transcript", async () => {
    mockSession({ id: "admin1", name: "Daniel", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/lms/transcript?userId=u2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.learnerName).toBe("Bilal Khan");
  });

  it("404s when the target user does not exist", async () => {
    routeFindUnique(null);
    mockSession({ id: "admin1", name: "Daniel", role: "admin" });
    const res = await GET(
      createRequest("GET", "/api/lms/transcript?userId=ghost"),
    );
    expect(res.status).toBe(404);
  });
});
