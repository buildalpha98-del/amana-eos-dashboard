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
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET } from "@/app/api/marketing/whatsapp/coordinator-history/[serviceId]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/marketing/whatsapp/coordinator-history/[serviceId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(
      createRequest("GET", "/api/marketing/whatsapp/coordinator-history/svc-1"),
      { params: Promise.resolve({ serviceId: "svc-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when service not found", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await GET(
      createRequest("GET", "/api/marketing/whatsapp/coordinator-history/missing"),
      { params: Promise.resolve({ serviceId: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 8 weeks of history with status flags", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1", name: "Centre A" });
    prismaMock.user.findFirst.mockResolvedValue({
      id: "coord-1",
      name: "Sara",
      email: "s@x.com",
      phone: null,
    });
    prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue([]);

    const res = await GET(
      createRequest("GET", "/api/marketing/whatsapp/coordinator-history/svc-1"),
      { params: Promise.resolve({ serviceId: "svc-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.serviceName).toBe("Centre A");
    expect(data.coordinatorName).toBe("Sara");
    expect(data.weeks).toHaveLength(8);
    expect(data.weeks[0].floor).toBe(4);
    expect(data.weeks[0].target).toBe(5);
    expect(["green", "amber", "red"]).toContain(data.weeks[0].status);
  });
});
