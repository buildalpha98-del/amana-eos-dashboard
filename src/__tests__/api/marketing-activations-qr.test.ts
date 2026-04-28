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

import { GET as QR_GET, PATCH as QR_PATCH } from "@/app/api/marketing/activations/[id]/qr/route";
import { GET as STATS_GET } from "@/app/api/marketing/activations/[id]/qr-stats/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  process.env.NEXTAUTH_URL = "https://amanaoshc.company";
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("GET /api/marketing/activations/[id]/qr", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await QR_GET(createRequest("GET", "/api/marketing/activations/x/qr"), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(401);
  });

  it("404 missing activation", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await QR_GET(createRequest("GET", "/api/marketing/activations/missing/qr"), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns existing short code without creating one", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ qrShortCode: "abc1234" });
    const res = await QR_GET(createRequest("GET", "/api/marketing/activations/a-1/qr"), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shortCode).toBe("abc1234");
    expect(data.scanUrl).toBe("https://amanaoshc.company/a/abc1234");
    expect(data.svg).toContain("<svg");
    expect(prismaMock.campaignActivationAssignment.update).not.toHaveBeenCalled();
  });

  it("lazily generates a short code when none exists", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique
      .mockResolvedValueOnce({ qrShortCode: null }) // first lookup for activation
      .mockResolvedValueOnce(null); // collision-check lookup
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({ qrShortCode: "newcode" });
    const res = await QR_GET(createRequest("GET", "/api/marketing/activations/a-1/qr"), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.campaignActivationAssignment.update).toHaveBeenCalled();
  });
});

describe("PATCH /api/marketing/activations/[id]/qr", () => {
  it("400 invalid destination URL", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ id: "a-1", qrShortCode: "abc1234" });
    const res = await QR_PATCH(
      createRequest("PATCH", "/api/marketing/activations/a-1/qr", { body: { destinationUrl: "not a url" } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("clears destination when empty string passed", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ id: "a-1", qrShortCode: "abc1234" });
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({ id: "a-1", qrShortCode: "abc1234", qrDestinationUrl: null });
    const res = await QR_PATCH(
      createRequest("PATCH", "/api/marketing/activations/a-1/qr", { body: { destinationUrl: "" } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.campaignActivationAssignment.update.mock.calls[0][0];
    expect(updateArg.data.qrDestinationUrl).toBeNull();
  });

  it("regenerate flag rotates the short code", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique
      .mockResolvedValueOnce({ id: "a-1", qrShortCode: "oldcode" }) // initial lookup
      .mockResolvedValueOnce(null); // collision check for new code
    prismaMock.campaignActivationAssignment.update.mockResolvedValue({ id: "a-1", qrShortCode: "newcode", qrDestinationUrl: null });
    const res = await QR_PATCH(
      createRequest("PATCH", "/api/marketing/activations/a-1/qr", { body: { regenerate: true } }),
      { params: Promise.resolve({ id: "a-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shortCode).toBe("newcode");
    const updateArg = prismaMock.campaignActivationAssignment.update.mock.calls[0][0];
    expect(updateArg.data.qrShortCode).toBeTruthy();
  });
});

describe("GET /api/marketing/activations/[id]/qr-stats", () => {
  it("returns scan count, unique visitors, conversion rate", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      qrShortCode: "abc1234",
      qrDestinationUrl: null,
      scheduledFor: null,
    });
    const now = Date.now();
    prismaMock.activationScan.findMany
      .mockResolvedValueOnce([
        { scannedAt: new Date(now - 3 * 86400000), ipHash: "h1" },
        { scannedAt: new Date(now - 2 * 86400000), ipHash: "h1" },
        { scannedAt: new Date(now - 1 * 86400000), ipHash: "h2" },
      ])
      .mockResolvedValueOnce([
        { id: "s-1", scannedAt: new Date(now - 1 * 86400000), userAgent: "iPhone Safari", referrer: null },
      ]);
    prismaMock.parentEnquiry.findMany
      .mockResolvedValueOnce([
        { id: "e-1", stage: "new_enquiry", createdAt: new Date() },
        { id: "e-2", stage: "enrolled", createdAt: new Date() },
      ])
      .mockResolvedValueOnce([
        { id: "e-1", parentName: "Sara", stage: "new_enquiry", createdAt: new Date() },
      ]);
    const res = await STATS_GET(createRequest("GET", "/api/marketing/activations/a-1/qr-stats"), { params: Promise.resolve({ id: "a-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totals.scans).toBe(3);
    expect(data.totals.uniqueVisitors).toBe(2);
    expect(data.totals.enquiries).toBe(2);
    expect(data.totals.enrolled).toBe(1);
    expect(data.totals.conversionRate).toBeCloseTo(2 / 3, 2);
    expect(data.timeline).toHaveLength(30);
    expect(data.recentScans).toHaveLength(1);
    expect(data.recentEnquiries).toHaveLength(1);
  });

  it("404 missing activation", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await STATS_GET(createRequest("GET", "/api/marketing/activations/x/qr-stats"), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(404);
  });
});
