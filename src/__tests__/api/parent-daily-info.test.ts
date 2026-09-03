import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

// Mock parent-auth
const mockParentPayload = { email: "parent@test.com", name: "Test Parent", enrolmentIds: ["enr-1"] };
let parentAuthEnabled = true;

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth: (handler: (...args: unknown[]) => unknown) => {
    return async (req: Request, routeContext?: unknown) => {
      if (!parentAuthEnabled) {
        const { NextResponse } = await import("next/server");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const ctx = { ...((routeContext as object) ?? {}), parent: mockParentPayload };
      return handler(req, ctx);
    };
  },
}));

import { GET } from "@/app/api/parent/daily-info/route";

describe("GET /api/parent/daily-info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    mockParentPayload.enrolmentIds = ["enr-1"];
  });

  it("returns 401 when not authenticated", async () => {
    parentAuthEnabled = false;
    const req = createRequest("GET", "/api/parent/daily-info");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(401);
  });

  it("returns null menu and empty program with no enrolments", async () => {
    mockParentPayload.enrolmentIds = [];
    const req = createRequest("GET", "/api/parent/daily-info");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.todayMenu).toBeNull();
    expect(body.todayProgram).toEqual([]);
  });

  it("returns null menu and empty program when no service found", async () => {
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: null },
    ]);
    const req = createRequest("GET", "/api/parent/daily-info");
    const res = await GET(req, undefined as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.todayMenu).toBeNull();
    expect(body.todayProgram).toEqual([]);
  });

  it("returns menu items and program activities when available", async () => {
    // Pin "now" to a known weekday — the route returns empty arrays on
    // weekends (no menu/program rows for Sat/Sun in OSHC). Without this,
    // the test was flaky and failed every Saturday + Sunday CI run.
    // Wednesday 2026-04-22 12:00 AEST is reliably a weekday across DST.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T02:00:00.000Z"));

    try {
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "svc-1" },
      ]);

      prismaMock.menuWeek.findMany.mockResolvedValue([
        {
          id: "mw-1",
          items: [
            // `day` is carried since the route began returning the whole
            // week (2026-08-05) — today's slice is filtered from it.
            { day: "wednesday", slot: "morning_tea", description: "Fruit platter", allergens: ["nuts"] },
            { day: "wednesday", slot: "lunch", description: "Pasta", allergens: [] },
            // A different day's item must land in `week` but NOT in today.
            { day: "friday", slot: "lunch", description: "Pizza", allergens: [] },
          ],
        },
      ]);

      prismaMock.programActivity.findMany.mockResolvedValue([
        {
          id: "pa-1",
          day: "wednesday",
          title: "Art class",
          description: "Painting",
          startTime: "15:30",
          endTime: "16:30",
          location: "Art room",
          staffName: "Sarah",
          programmeBrand: null,
        },
      ]);

      const req = createRequest("GET", "/api/parent/daily-info");
      const res = await GET(req, undefined as never);
      expect(res.status).toBe(200);
      const body = await res.json();

      // Menu should have items
      if (body.todayMenu) {
        expect(body.todayMenu.items.length).toBeGreaterThanOrEqual(1);
        expect(body.todayMenu.items[0].description).toBeDefined();
      }

      // Program should have activities
      expect(body.todayProgram).toHaveLength(1);
      expect(body.todayProgram[0].title).toBe("Art class");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GET /api/parent/daily-info — the week", () => {
  it("returns every weekday's menu and programme, not just today's", async () => {
    // Parents plan around the week — "what's for lunch Thursday" is a
    // week question, and answering one day at a time meant it couldn't
    // be answered at all.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T02:00:00.000Z")); // Wednesday

    try {
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "svc-1" },
      ]);
      prismaMock.menuWeek.findMany.mockResolvedValue([
        {
          id: "mw-1",
          items: [
            { day: "wednesday", slot: "lunch", description: "Pasta", allergens: [] },
            { day: "friday", slot: "lunch", description: "Pizza", allergens: [] },
          ],
        },
      ]);
      prismaMock.programActivity.findMany.mockResolvedValue([]);

      const req = createRequest("GET", "/api/parent/daily-info");
      const res = await GET(req, undefined as never);
      const body = await res.json();

      const friday = body.week.find((d: { day: string }) => d.day === "friday");
      expect(friday.menu).toHaveLength(1);
      expect(friday.menu[0].description).toBe("Pizza");
      // ...while today's slice stays today's.
      expect(body.todayMenu.items).toHaveLength(1);
      expect(body.todayMenu.items[0].description).toBe("Pasta");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still answers on a weekend — today empty, the week intact", async () => {
    // Sunday-evening planning is exactly when the week view matters.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T02:00:00.000Z")); // Sunday

    try {
      prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
        { serviceId: "svc-1" },
      ]);
      prismaMock.menuWeek.findMany.mockResolvedValue([
        {
          id: "mw-1",
          items: [
            { day: "monday", slot: "lunch", description: "Wraps", allergens: [] },
          ],
        },
      ]);
      prismaMock.programActivity.findMany.mockResolvedValue([]);

      const req = createRequest("GET", "/api/parent/daily-info");
      const body = await (await GET(req, undefined as never)).json();

      expect(body.todayMenu).toBeNull();
      const monday = body.week.find((d: { day: string }) => d.day === "monday");
      expect(monday.menu).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
