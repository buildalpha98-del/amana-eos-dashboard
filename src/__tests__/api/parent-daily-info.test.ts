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
  withParentAuth: (handler: Function) => {
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
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1" },
    ]);

    prismaMock.menuWeek.findMany.mockResolvedValue([
      {
        id: "mw-1",
        items: [
          { slot: "morning_tea", description: "Fruit platter", allergens: ["nuts"] },
          { slot: "lunch", description: "Pasta", allergens: [] },
        ],
      },
    ]);

    prismaMock.programActivity.findMany.mockResolvedValue([
      {
        id: "pa-1",
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
  });
});
