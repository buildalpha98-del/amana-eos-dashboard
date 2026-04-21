import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/service-scope", () => ({
  getServiceScope: vi.fn(() => null),
  getStateScope: vi.fn(() => null),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { _clearUserActiveCache } from "@/lib/server-auth";
import { GET } from "@/app/api/measurables/[id]/history/route";

async function invoke(id: string, query = "") {
  const req = createRequest("GET", `/api/measurables/${id}/history${query}`);
  return GET(req, { params: Promise.resolve({ id }) });
}

describe("GET /api/measurables/[id]/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await invoke("m1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when measurable missing", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.measurable.findUnique.mockResolvedValue(null);
    const res = await invoke("missing");
    expect(res.status).toBe(404);
  });

  it("returns last 12 weeks by default, sorted oldest → newest", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.measurable.findUnique.mockResolvedValue({
      id: "m1",
      title: "Attendance",
      goalDirection: "above",
      goalValue: 50,
      unit: null,
      serviceId: null,
    });
    prismaMock.measurableEntry.findMany.mockResolvedValue([
      { weekOf: new Date("2026-04-13"), value: 55, onTrack: true },
      { weekOf: new Date("2026-04-06"), value: 52, onTrack: true },
    ]);
    const res = await invoke("m1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.measurable.id).toBe("m1");
    expect(body.measurable.goalValue).toBe(50);
    expect(body.entries).toHaveLength(2);
    expect(new Date(body.entries[0].weekOf) < new Date(body.entries[1].weekOf)).toBe(true);
  });

  it("honours ?weeks param (clamped to 1..52)", async () => {
    mockSession({ id: "u1", name: "U", role: "owner" });
    prismaMock.measurable.findUnique.mockResolvedValue({
      id: "m1", title: "T", goalDirection: "above", goalValue: 1, unit: null, serviceId: null,
    });
    prismaMock.measurableEntry.findMany.mockResolvedValue([]);
    await invoke("m1", "?weeks=100");
    const call = prismaMock.measurableEntry.findMany.mock.calls[0][0];
    expect(call.take).toBe(52);
  });
});
