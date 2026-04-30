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

import { GET } from "@/app/api/children/[id]/attendances/route";

const ctx = (params: Record<string, string>) => ({
  params: Promise.resolve(params),
});

describe("GET /api/children/[id]/attendances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-04-01&to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when `from` is missing", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when `to` is missing", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-04-01",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when `from` is malformed", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-4-1&to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when `to` is malformed", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-04-01&to=not-a-date",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when child not found", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.findUnique.mockResolvedValue(null);
    const req = createRequest(
      "GET",
      "/api/children/missing/attendances?from=2026-04-01&to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "missing" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-admin viewer is at a different service", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc-2",
    });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
    });
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-04-01&to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(403);
    expect(prismaMock.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  it("200 happy path: returns shaped records + stats", async () => {
    mockSession({ id: "u1", name: "Admin", role: "admin", serviceId: null });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
    });
    // Two records: one present (with sign-in/out), one absent.
    prismaMock.attendanceRecord.findMany.mockResolvedValue([
      {
        id: "ar-1",
        childId: "child-1",
        date: new Date("2026-04-10T00:00:00.000Z"),
        sessionType: "asc",
        status: "present",
        signInTime: new Date("2026-04-10T05:00:00.000Z"),
        signOutTime: new Date("2026-04-10T08:00:00.000Z"), // 3h
        signedInBy: { id: "s1", name: "Staff One" },
        signedOutBy: { id: "s1", name: "Staff One" },
        absenceReason: null,
        notes: "fine",
      },
      {
        id: "ar-2",
        childId: "child-1",
        date: new Date("2026-04-11T00:00:00.000Z"),
        sessionType: "bsc",
        status: "absent",
        signInTime: null,
        signOutTime: null,
        signedInBy: null,
        signedOutBy: null,
        absenceReason: "sick",
        notes: null,
      },
    ]);
    prismaMock.booking.findMany.mockResolvedValue([
      {
        date: new Date("2026-04-10T00:00:00.000Z"),
        sessionType: "asc",
        fee: 30,
      },
    ]);

    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-04-01&to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      records: Array<{
        id: string;
        date: string;
        sessionType: string;
        status: string;
        fee: number | null;
      }>;
      stats: {
        attendances: number;
        absences: number;
        totalFee: number;
        totalHours: number;
      };
    };

    // Records shape — date is YYYY-MM-DD, not a full timestamp
    expect(data.records).toHaveLength(2);
    expect(data.records[0].date).toBe("2026-04-10");
    expect(data.records[0].sessionType).toBe("asc");
    expect(data.records[0].status).toBe("present");
    expect(data.records[0].fee).toBe(30);
    expect(data.records[1].date).toBe("2026-04-11");
    expect(data.records[1].status).toBe("absent");
    expect(data.records[1].fee).toBe(null);

    // Stats shape
    expect(data.stats.attendances).toBe(1);
    expect(data.stats.absences).toBe(1);
    expect(data.stats.totalFee).toBe(30);
    expect(data.stats.totalHours).toBe(3);
  });

  it("non-admin at same service as child → 200", async () => {
    mockSession({
      id: "u1",
      name: "Coord",
      role: "member",
      serviceId: "svc-1",
    });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      serviceId: "svc-1",
    });
    prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
    prismaMock.booking.findMany.mockResolvedValue([]);

    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2026-04-01&to=2026-04-30",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      records: unknown[];
      stats: { attendances: number };
    };
    expect(data.records).toEqual([]);
    expect(data.stats.attendances).toBe(0);
  });

  it("400 when range exceeds 366 days (abuse guard)", async () => {
    mockSession({ id: "u1", name: "Owner", role: "owner", serviceId: null });
    prismaMock.child.findUnique.mockResolvedValue({
      id: "child-1",
      serviceId: null,
    });
    const req = createRequest(
      "GET",
      "/api/children/child-1/attendances?from=2024-01-01&to=2025-06-01",
    );
    const res = await GET(req, ctx({ id: "child-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/range/i);
  });
});
