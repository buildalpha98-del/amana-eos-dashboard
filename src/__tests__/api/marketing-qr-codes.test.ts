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

import { GET as LIST_GET, POST as CREATE_POST } from "@/app/api/marketing/qr-codes/route";
import { GET as DETAIL_GET, PATCH as PATCH_ROUTE, DELETE as DELETE_ROUTE } from "@/app/api/marketing/qr-codes/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  process.env.NEXTAUTH_URL = "https://amanaoshc.company";
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("GET /api/marketing/qr-codes", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await LIST_GET(createRequest("GET", "/api/marketing/qr-codes"));
    expect(res.status).toBe(401);
  });

  it("403 staff", async () => {
    mockSession({ id: "u", name: "Staff", role: "staff" });
    const res = await LIST_GET(createRequest("GET", "/api/marketing/qr-codes"));
    expect(res.status).toBe(403);
  });

  it("returns codes with computed totals", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findMany.mockResolvedValue([
      {
        id: "qr-1",
        shortCode: "abc1234",
        name: "Minarah Term 2 flyer",
        description: null,
        destinationUrl: "https://example.com/dest",
        active: true,
        activationId: null,
        serviceId: "s-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        activation: null,
        service: { id: "s-1", name: "Centre A", code: "AAA" },
        createdBy: { id: "akram", name: "Akram" },
        scans: [{ ipHash: "h1" }, { ipHash: "h1" }, { ipHash: "h2" }],
      },
    ]);
    const res = await LIST_GET(createRequest("GET", "/api/marketing/qr-codes"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.codes).toHaveLength(1);
    expect(data.codes[0].totals.scans).toBe(3);
    expect(data.codes[0].totals.uniqueVisitors).toBe(2);
    expect(data.codes[0].scanUrl).toBe("https://amanaoshc.company/a/abc1234");
  });

  it("filters by active=false", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findMany.mockResolvedValue([]);
    await LIST_GET(createRequest("GET", "/api/marketing/qr-codes?active=false"));
    const findArgs = prismaMock.qrCode.findMany.mock.calls[0][0];
    expect(findArgs.where.active).toBe(false);
  });
});

describe("POST /api/marketing/qr-codes", () => {
  it("400 invalid URL", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await CREATE_POST(
      createRequest("POST", "/api/marketing/qr-codes", {
        body: { name: "X", destinationUrl: "not-a-url" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 unknown activationId", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await CREATE_POST(
      createRequest("POST", "/api/marketing/qr-codes", {
        body: { name: "X", destinationUrl: "https://example.com", activationId: "missing" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates with generated short code", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findUnique.mockResolvedValue(null);
    prismaMock.qrCode.create.mockResolvedValue({
      id: "qr-new",
      shortCode: "newcode",
      name: "Minarah Term 2 flyer batch A",
      destinationUrl: "https://example.com/dest",
      active: true,
    });
    const res = await CREATE_POST(
      createRequest("POST", "/api/marketing/qr-codes", {
        body: { name: "Minarah Term 2 flyer batch A", destinationUrl: "https://example.com/dest" },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.shortCode).toBeTruthy();
    expect(data.scanUrl).toMatch(/^https:\/\/amanaoshc\.company\/a\//);
    expect(data.name).toBe("Minarah Term 2 flyer batch A");
  });
});

describe("GET /api/marketing/qr-codes/[id]", () => {
  it("404 missing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findUnique.mockResolvedValue(null);
    const res = await DETAIL_GET(
      createRequest("GET", "/api/marketing/qr-codes/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns SVG, totals, timeline, top locations", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const now = new Date();
    prismaMock.qrCode.findUnique.mockResolvedValue({
      id: "qr-1",
      shortCode: "abc1234",
      name: "Test QR",
      description: null,
      destinationUrl: "https://example.com",
      active: true,
      activationId: null,
      serviceId: "s-1",
      createdAt: now,
      updatedAt: now,
      activation: null,
      service: { id: "s-1", name: "Centre A", code: "AAA" },
      createdBy: { id: "akram", name: "Akram" },
      scans: [
        { id: "s-1", scannedAt: new Date(now.getTime() - 86400000), ipHash: "h1", userAgent: "iPhone", referrer: null, country: "AU", region: "VIC", city: "Melbourne" },
        { id: "s-2", scannedAt: new Date(now.getTime() - 86400000), ipHash: "h1", userAgent: "iPhone", referrer: null, country: "AU", region: "VIC", city: "Melbourne" },
        { id: "s-3", scannedAt: new Date(), ipHash: "h2", userAgent: "Android", referrer: null, country: "AU", region: "NSW", city: "Sydney" },
      ],
    });
    const res = await DETAIL_GET(
      createRequest("GET", "/api/marketing/qr-codes/qr-1"),
      { params: Promise.resolve({ id: "qr-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.svg).toContain("<svg");
    expect(data.totals.scans).toBe(3);
    expect(data.totals.uniqueVisitors).toBe(2);
    expect(data.timeline).toHaveLength(30);
    expect(data.topLocations).toHaveLength(2);
    expect(data.topLocations[0].location).toMatch(/Melbourne/);
    expect(data.recentScans).toHaveLength(3);
  });
});

describe("PATCH /api/marketing/qr-codes/[id]", () => {
  it("404 missing", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findUnique.mockResolvedValue(null);
    const res = await PATCH_ROUTE(
      createRequest("PATCH", "/api/marketing/qr-codes/missing", { body: { name: "X" } }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("updates name + destination", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findUnique.mockResolvedValue({ id: "qr-1" });
    prismaMock.qrCode.update.mockResolvedValue({
      id: "qr-1",
      shortCode: "abc1234",
      name: "Renamed",
      destinationUrl: "https://newdest.example",
      active: true,
    });
    const res = await PATCH_ROUTE(
      createRequest("PATCH", "/api/marketing/qr-codes/qr-1", {
        body: { name: "Renamed", destinationUrl: "https://newdest.example" },
      }),
      { params: Promise.resolve({ id: "qr-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Renamed");
    expect(data.destinationUrl).toBe("https://newdest.example");
  });

  it("regenerates short code when regenerate=true", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findUnique
      .mockResolvedValueOnce({ id: "qr-1" }) // initial existence check
      .mockResolvedValueOnce(null); // shortcode collision check
    prismaMock.qrCode.update.mockResolvedValue({
      id: "qr-1",
      shortCode: "newcode",
      name: "Test",
      destinationUrl: "https://example.com",
      active: true,
    });
    const res = await PATCH_ROUTE(
      createRequest("PATCH", "/api/marketing/qr-codes/qr-1", { body: { regenerate: true } }),
      { params: Promise.resolve({ id: "qr-1" }) },
    );
    expect(res.status).toBe(200);
    const updateArg = prismaMock.qrCode.update.mock.calls[0][0];
    expect(updateArg.data.shortCode).toBeTruthy();
  });
});

describe("DELETE /api/marketing/qr-codes/[id]", () => {
  it("soft-archives instead of hard-deleting", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.qrCode.findUnique.mockResolvedValue({ id: "qr-1" });
    prismaMock.qrCode.update.mockResolvedValue({ id: "qr-1", active: false });
    const res = await DELETE_ROUTE(
      createRequest("DELETE", "/api/marketing/qr-codes/qr-1"),
      { params: Promise.resolve({ id: "qr-1" }) },
    );
    expect(res.status).toBe(200);
    expect(prismaMock.qrCode.update.mock.calls[0][0].data.active).toBe(false);
  });
});
