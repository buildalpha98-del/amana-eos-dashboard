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

import { GET } from "@/app/api/marketing/whatsapp/grid/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/marketing/whatsapp/grid", () => {
  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/marketing/whatsapp/grid?weekStart=2026-04-20"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-marketing role", async () => {
    mockSession({ id: "u-1", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/marketing/whatsapp/grid?weekStart=2026-04-20"));
    expect(res.status).toBe(403);
  });

  it("returns 5×N grid with summary, network posts, and patterns", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findMany.mockResolvedValue([
      { id: "svc-1", name: "Centre A", state: "NSW", code: "AAA" },
      { id: "svc-2", name: "Centre B", state: "VIC", code: "BBB" },
    ]);
    prismaMock.user.findFirst.mockResolvedValue({
      id: "coord-1",
      name: "Sara",
      email: "s@x.com",
      phone: "+61400000001",
    });
    prismaMock.whatsAppCoordinatorPost.findMany.mockResolvedValue([
      {
        id: "rec-1",
        serviceId: "svc-1",
        postedDate: new Date("2026-04-20T00:00:00Z"),
        posted: true,
        notPostingReason: null,
        notes: null,
        updatedAt: new Date("2026-04-20T10:00:00Z"),
        recordedBy: { id: "akram", name: "Akram" },
      },
      {
        id: "rec-2",
        serviceId: "svc-2",
        postedDate: new Date("2026-04-21T00:00:00Z"),
        posted: false,
        notPostingReason: "coordinator_sick",
        notes: "Out today",
        updatedAt: new Date("2026-04-21T10:00:00Z"),
        recordedBy: { id: "akram", name: "Akram" },
      },
    ]);
    prismaMock.whatsAppNetworkPost.findMany.mockResolvedValue([
      {
        id: "np-1",
        group: "engagement",
        postedAt: new Date("2026-04-21T09:00:00Z"),
        topic: "Holiday programme",
        notes: null,
        marketingPostId: null,
        recordedBy: { id: "akram", name: "Akram" },
      },
    ]);

    const res = await GET(createRequest("GET", "/api/marketing/whatsapp/grid?weekStart=2026-04-20"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.week.start).toBe("2026-04-20");
    expect(data.week.end).toBe("2026-04-26");
    expect(data.centres).toHaveLength(2);
    expect(data.days).toHaveLength(5);
    expect(data.days[0].dayLabel).toBe("Mon");
    expect(data.days[4].dayLabel).toBe("Fri");
    expect(data.cells).toHaveLength(2 * 5);

    const cellWithRecord = data.cells.find((c: any) => c.serviceId === "svc-1" && c.date === "2026-04-20");
    expect(cellWithRecord.record.posted).toBe(true);

    const emptyCell = data.cells.find((c: any) => c.serviceId === "svc-1" && c.date === "2026-04-22");
    expect(emptyCell.record).toBeNull();

    expect(data.summary.totalCells).toBe(10);
    expect(data.summary.cellsChecked).toBe(2);
    expect(data.summary.posted).toBe(1);
    expect(data.summary.notPosted).toBe(1);
    expect(data.summary.target).toBe(50);
    expect(data.summary.floor).toBe(35);

    expect(data.networkPosts.engagement.count).toBe(1);
    expect(data.networkPosts.engagement.target).toBe(3);
    expect(data.networkPosts.announcements.count).toBe(0);
    expect(data.networkPosts.announcements.target).toBe(2);

    expect(Array.isArray(data.patterns.twoWeekConcerns)).toBe(true);
  });

  it("400 on invalid weekStart", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await GET(createRequest("GET", "/api/marketing/whatsapp/grid?weekStart=not-a-date"));
    expect(res.status).toBe(400);
  });
});
