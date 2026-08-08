import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  resolveCampaignWindow,
  getCampaignSendIds,
  getEmailEngagement,
  getQrScans,
  getAttributedEnquiries,
  getEnrolmentsWon,
  getOccupancyDelta,
} from "@/lib/campaign-attribution";

beforeEach(() => {
  vi.clearAllMocks();
});

const NOW = new Date("2026-08-08T10:00:00.000Z");

describe("resolveCampaignWindow", () => {
  it("uses startDate/endDate as-is when both set and in the past", () => {
    const start = new Date("2026-06-01T00:00:00.000Z");
    const end = new Date("2026-07-01T00:00:00.000Z");
    const win = resolveCampaignWindow(
      { startDate: start, endDate: end, createdAt: new Date("2026-05-01T00:00:00.000Z") },
      NOW,
    );
    expect(win).toEqual({ start, end });
  });

  it("falls back to createdAt when startDate is null", () => {
    const createdAt = new Date("2026-05-15T00:00:00.000Z");
    const end = new Date("2026-07-01T00:00:00.000Z");
    const win = resolveCampaignWindow({ startDate: null, endDate: end, createdAt }, NOW);
    expect(win).toEqual({ start: createdAt, end });
  });

  it("falls back to now when endDate is null", () => {
    const start = new Date("2026-06-01T00:00:00.000Z");
    const win = resolveCampaignWindow({ startDate: start, endDate: null, createdAt: start }, NOW);
    expect(win).toEqual({ start, end: NOW });
  });

  it("clamps a future endDate to now", () => {
    const start = new Date("2026-06-01T00:00:00.000Z");
    const win = resolveCampaignWindow(
      { startDate: start, endDate: new Date("2026-12-31T00:00:00.000Z"), createdAt: start },
      NOW,
    );
    expect(win).toEqual({ start, end: NOW });
  });

  it("clamps an inverted window (endDate before startDate) to end = start", () => {
    const start = new Date("2026-06-10T00:00:00.000Z");
    const win = resolveCampaignWindow(
      { startDate: start, endDate: new Date("2026-06-01T00:00:00.000Z"), createdAt: start },
      NOW,
    );
    expect(win).toEqual({ start, end: start });
  });

  it("clamps to a zero-length window for an entirely future campaign", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const win = resolveCampaignWindow(
      { startDate: start, endDate: new Date("2026-10-01T00:00:00.000Z"), createdAt: NOW },
      NOW,
    );
    // end = min(endDate, now) = now, then clamped up to start.
    expect(win).toEqual({ start, end: start });
  });

  it("handles all-null dates: createdAt → now", () => {
    const createdAt = new Date("2026-07-01T00:00:00.000Z");
    const win = resolveCampaignWindow({ startDate: null, endDate: null, createdAt }, NOW);
    expect(win).toEqual({ start: createdAt, end: NOW });
  });
});

describe("getCampaignSendIds", () => {
  it("unions direct campaign sends with transitive post sends and sums recipients", async () => {
    prismaMock.marketingPost.findMany.mockResolvedValue([
      { deliveryLogId: "dl-post-1" },
      { deliveryLogId: "dl-post-2" },
    ]);
    prismaMock.deliveryLog.findMany.mockResolvedValue([
      { id: "dl-direct-1", recipientCount: 100 },
      { id: "dl-post-1", recipientCount: 40 },
      { id: "dl-post-2", recipientCount: 10 },
    ]);

    const result = await getCampaignSendIds(prismaMock, "camp-1");

    expect(prismaMock.marketingPost.findMany).toHaveBeenCalledWith({
      where: { campaignId: "camp-1", deliveryLogId: { not: null } },
      select: { deliveryLogId: true },
    });
    expect(prismaMock.deliveryLog.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { entityType: "MarketingCampaign", entityId: "camp-1" },
          { id: { in: ["dl-post-1", "dl-post-2"] } },
        ],
      },
      select: { id: true, recipientCount: true },
    });
    expect(result).toEqual({
      sendIds: ["dl-direct-1", "dl-post-1", "dl-post-2"],
      recipients: 150,
    });
  });

  it("returns zeros when the campaign has no sends", async () => {
    prismaMock.marketingPost.findMany.mockResolvedValue([]);
    prismaMock.deliveryLog.findMany.mockResolvedValue([]);

    const result = await getCampaignSendIds(prismaMock, "camp-empty");

    expect(prismaMock.deliveryLog.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { entityType: "MarketingCampaign", entityId: "camp-empty" },
          { id: { in: [] } },
        ],
      },
      select: { id: true, recipientCount: true },
    });
    expect(result).toEqual({ sendIds: [], recipients: 0 });
  });
});

describe("getEmailEngagement", () => {
  const window = {
    start: new Date("2026-06-01T00:00:00.000Z"),
    end: new Date("2026-07-01T00:00:00.000Z"),
  };

  it("returns zeros WITHOUT querying when sendIds is empty", async () => {
    const result = await getEmailEngagement(prismaMock, [], window);
    expect(result).toEqual({ uniqueOpens: 0, uniqueClicks: 0 });
    expect(prismaMock.emailEvent.groupBy).not.toHaveBeenCalled();
  });

  it("groups by [type, email] and counts distinct emails per type", async () => {
    // a@x opened via two different sends (two messageIds → two groups is NOT
    // possible since grouping collapses by email — but a@x can appear once per
    // type). b@x opened only; a@x also clicked.
    prismaMock.emailEvent.groupBy.mockResolvedValue([
      { type: "opened", email: "a@x.com" },
      { type: "opened", email: "b@x.com" },
      { type: "clicked", email: "a@x.com" },
    ]);

    const result = await getEmailEngagement(prismaMock, ["dl-1", "dl-2"], window);

    expect(prismaMock.emailEvent.groupBy).toHaveBeenCalledWith({
      by: ["type", "email"],
      where: {
        deliveryLogId: { in: ["dl-1", "dl-2"] },
        createdAt: { gte: window.start, lte: window.end },
        type: { in: ["opened", "clicked"] },
      },
    });
    expect(result).toEqual({ uniqueOpens: 2, uniqueClicks: 1 });
  });

  it("returns zeros when no events exist", async () => {
    prismaMock.emailEvent.groupBy.mockResolvedValue([]);
    const result = await getEmailEngagement(prismaMock, ["dl-1"], window);
    expect(result).toEqual({ uniqueOpens: 0, uniqueClicks: 0 });
  });
});

describe("getQrScans", () => {
  const window = {
    start: new Date("2026-06-01T00:00:00.000Z"),
    end: new Date("2026-07-01T00:00:00.000Z"),
  };

  it("counts scans transitively via qrCode.activation.campaignId", async () => {
    prismaMock.qrScan.count.mockResolvedValue(42);
    prismaMock.qrScan.groupBy.mockResolvedValue([
      { ipHash: "h1" },
      { ipHash: "h2" },
      { ipHash: "h3" },
    ]);

    const result = await getQrScans(prismaMock, "camp-1", window);

    expect(prismaMock.qrScan.count).toHaveBeenCalledWith({
      where: {
        scannedAt: { gte: window.start, lte: window.end },
        qrCode: { activation: { campaignId: "camp-1" } },
      },
    });
    // Uniques MUST exclude null ipHash — null hashes would collapse into one
    // bogus "unique scanner" group.
    expect(prismaMock.qrScan.groupBy).toHaveBeenCalledWith({
      by: ["ipHash"],
      where: {
        scannedAt: { gte: window.start, lte: window.end },
        qrCode: { activation: { campaignId: "camp-1" } },
        ipHash: { not: null },
      },
    });
    expect(result).toEqual({ scans: 42, uniqueScanners: 3 });
  });

  it("returns zeros for a campaign with no scans", async () => {
    prismaMock.qrScan.count.mockResolvedValue(0);
    prismaMock.qrScan.groupBy.mockResolvedValue([]);
    const result = await getQrScans(prismaMock, "camp-none", window);
    expect(result).toEqual({ scans: 0, uniqueScanners: 0 });
  });
});

describe("getAttributedEnquiries", () => {
  const window = {
    start: new Date("2026-06-01T00:00:00.000Z"),
    end: new Date("2026-07-01T00:00:00.000Z"),
  };

  it("counts attributed via sourceActivation and contextual via linked services", async () => {
    prismaMock.parentEnquiry.count.mockImplementation(
      async (args: { where: { sourceActivation?: unknown } }) =>
        args.where.sourceActivation ? 4 : 17,
    );

    const result = await getAttributedEnquiries(prismaMock, "camp-1", ["svc-1", "svc-2"], window);

    expect(prismaMock.parentEnquiry.count).toHaveBeenCalledWith({
      where: {
        deleted: false,
        createdAt: { gte: window.start, lte: window.end },
        sourceActivation: { campaignId: "camp-1" },
      },
    });
    expect(prismaMock.parentEnquiry.count).toHaveBeenCalledWith({
      where: {
        deleted: false,
        createdAt: { gte: window.start, lte: window.end },
        serviceId: { in: ["svc-1", "svc-2"] },
      },
    });
    expect(result).toEqual({ attributed: 4, contextual: 17 });
  });

  it("skips the contextual query when linkedServiceIds is empty", async () => {
    prismaMock.parentEnquiry.count.mockResolvedValue(2);

    const result = await getAttributedEnquiries(prismaMock, "camp-1", [], window);

    expect(prismaMock.parentEnquiry.count).toHaveBeenCalledTimes(1);
    expect(prismaMock.parentEnquiry.count).toHaveBeenCalledWith({
      where: {
        deleted: false,
        createdAt: { gte: window.start, lte: window.end },
        sourceActivation: { campaignId: "camp-1" },
      },
    });
    expect(result).toEqual({ attributed: 2, contextual: 0 });
  });
});

describe("getEnrolmentsWon", () => {
  const window = {
    start: new Date("2026-06-01T00:00:00.000Z"),
    end: new Date("2026-07-01T00:00:00.000Z"),
  };

  it("counts enrolled stage events attributed + contextual", async () => {
    prismaMock.parentEnquiryStageEvent.count.mockImplementation(
      async (args: { where: { enquiry: { sourceActivation?: unknown } } }) =>
        args.where.enquiry.sourceActivation ? 3 : 9,
    );

    const result = await getEnrolmentsWon(prismaMock, "camp-1", ["svc-1"], window);

    expect(prismaMock.parentEnquiryStageEvent.count).toHaveBeenCalledWith({
      where: {
        toStage: "enrolled",
        createdAt: { gte: window.start, lte: window.end },
        enquiry: { deleted: false, sourceActivation: { campaignId: "camp-1" } },
      },
    });
    expect(prismaMock.parentEnquiryStageEvent.count).toHaveBeenCalledWith({
      where: {
        toStage: "enrolled",
        createdAt: { gte: window.start, lte: window.end },
        enquiry: { deleted: false, serviceId: { in: ["svc-1"] } },
      },
    });
    expect(result).toEqual({ attributed: 3, contextual: 9 });
  });

  it("skips the contextual query when linkedServiceIds is empty", async () => {
    prismaMock.parentEnquiryStageEvent.count.mockResolvedValue(1);

    const result = await getEnrolmentsWon(prismaMock, "camp-1", [], window);

    expect(prismaMock.parentEnquiryStageEvent.count).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ attributed: 1, contextual: 0 });
  });
});

describe("getOccupancyDelta", () => {
  const window = {
    start: new Date("2026-06-01T00:00:00.000Z"),
    end: new Date("2026-07-01T00:00:00.000Z"),
  };
  const DAY = 24 * 60 * 60 * 1000;

  it("returns empty result WITHOUT querying when serviceIds is empty", async () => {
    const result = await getOccupancyDelta(prismaMock, [], window);
    expect(result).toEqual({ services: [], overallStartPct: null, overallEndPct: null });
    expect(prismaMock.dailyAttendance.groupBy).not.toHaveBeenCalled();
  });

  it("computes per-service and weighted overall pcts from ±7-day windows", async () => {
    prismaMock.dailyAttendance.groupBy.mockImplementation(
      async (args: { where: { date: { gte: Date } } }) => {
        const isStartWindow =
          args.where.date.gte.getTime() === window.start.getTime() - 7 * DAY;
        return isStartWindow
          ? [
              { serviceId: "svc-1", _sum: { attended: 30, capacity: 40 } },
              { serviceId: "svc-2", _sum: { attended: 10, capacity: 20 } },
            ]
          : [
              { serviceId: "svc-1", _sum: { attended: 35, capacity: 40 } },
              { serviceId: "svc-2", _sum: { attended: 12, capacity: 20 } },
            ];
      },
    );

    const result = await getOccupancyDelta(prismaMock, ["svc-1", "svc-2"], window);

    expect(prismaMock.dailyAttendance.groupBy).toHaveBeenCalledTimes(2);
    expect(prismaMock.dailyAttendance.groupBy).toHaveBeenCalledWith({
      by: ["serviceId"],
      where: {
        serviceId: { in: ["svc-1", "svc-2"] },
        date: {
          gte: new Date(window.start.getTime() - 7 * DAY),
          lte: new Date(window.start.getTime() + 7 * DAY),
        },
      },
      _sum: { attended: true, capacity: true },
    });
    expect(prismaMock.dailyAttendance.groupBy).toHaveBeenCalledWith({
      by: ["serviceId"],
      where: {
        serviceId: { in: ["svc-1", "svc-2"] },
        date: {
          gte: new Date(window.end.getTime() - 7 * DAY),
          lte: new Date(window.end.getTime() + 7 * DAY),
        },
      },
      _sum: { attended: true, capacity: true },
    });

    expect(result.services).toEqual([
      { serviceId: "svc-1", startPct: 75, endPct: 87.5 },
      { serviceId: "svc-2", startPct: 50, endPct: 60 },
    ]);
    // Weighted overall: start 40/60 = 66.7, end 47/60 = 78.3 (1dp).
    expect(result.overallStartPct).toBe(66.7);
    expect(result.overallEndPct).toBe(78.3);
  });

  it("returns null pcts for services with zero capacity or no rows", async () => {
    prismaMock.dailyAttendance.groupBy.mockImplementation(
      async (args: { where: { date: { gte: Date } } }) => {
        const isStartWindow =
          args.where.date.gte.getTime() === window.start.getTime() - 7 * DAY;
        return isStartWindow
          ? [{ serviceId: "svc-zero", _sum: { attended: 5, capacity: 0 } }]
          : []; // no rows at all in the end window
      },
    );

    const result = await getOccupancyDelta(
      prismaMock,
      ["svc-zero", "svc-norows"],
      window,
    );

    expect(result.services).toEqual([
      { serviceId: "svc-zero", startPct: null, endPct: null },
      { serviceId: "svc-norows", startPct: null, endPct: null },
    ]);
    expect(result.overallStartPct).toBeNull();
    expect(result.overallEndPct).toBeNull();
  });

  it("keeps a service's valid endpoint when the other endpoint has no data", async () => {
    prismaMock.dailyAttendance.groupBy.mockImplementation(
      async (args: { where: { date: { gte: Date } } }) => {
        const isStartWindow =
          args.where.date.gte.getTime() === window.start.getTime() - 7 * DAY;
        return isStartWindow ? [] : [{ serviceId: "svc-1", _sum: { attended: 18, capacity: 24 } }];
      },
    );

    const result = await getOccupancyDelta(prismaMock, ["svc-1"], window);

    expect(result.services).toEqual([{ serviceId: "svc-1", startPct: null, endPct: 75 }]);
    expect(result.overallStartPct).toBeNull();
    expect(result.overallEndPct).toBe(75);
  });
});
