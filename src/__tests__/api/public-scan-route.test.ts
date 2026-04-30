import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/a/[code]/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://amanaoshc.company";
  process.env.NEXTAUTH_SECRET = "test-secret";
  prismaMock.qrScan.create.mockResolvedValue({ id: "scan-1" });
});

function buildReq(headers: Record<string, string> = {}) {
  return new NextRequest(new URL("https://amanaoshc.company/a/somecode"), { headers });
}

describe("GET /a/[code]", () => {
  it("redirects to fallback /enquire when code unknown", async () => {
    prismaMock.qrCode.findUnique.mockResolvedValue(null);
    const res = await GET(buildReq(), { params: Promise.resolve({ code: "missing" }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/enquire");
  });

  it("redirects to destination URL with utm params appended", async () => {
    prismaMock.qrCode.findUnique.mockResolvedValue({
      id: "qr-1",
      shortCode: "abc1234",
      destinationUrl: "https://amanaoshc.company/enquire?serviceId=s-1",
      active: true,
      service: { id: "s-1", name: "Centre A" },
    });
    const res = await GET(buildReq({ "user-agent": "iPhone" }), { params: Promise.resolve({ code: "abc1234" }) });
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("utm_source=qr");
    expect(location).toContain("utm_medium=activation");
    expect(location).toContain("utm_campaign=abc1234");
    expect(location).toContain("serviceId=s-1");
  });

  it("falls back when QR is archived (still resolves the scan)", async () => {
    prismaMock.qrCode.findUnique.mockResolvedValue({
      id: "qr-1",
      shortCode: "abc1234",
      destinationUrl: "https://example.com/special",
      active: false,
      service: { id: "s-1", name: "Centre A" },
    });
    const res = await GET(buildReq(), { params: Promise.resolve({ code: "abc1234" }) });
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/enquire");
    expect(location).toContain("serviceId=s-1");
    expect(location).toContain("utm_campaign=abc1234");
  });

  it("logs a scan with hashed IP, user-agent, and geolocation when headers present", async () => {
    prismaMock.qrCode.findUnique.mockResolvedValue({
      id: "qr-1",
      shortCode: "abc1234",
      destinationUrl: "https://example.com/dest",
      active: true,
      service: null,
    });
    await GET(
      buildReq({
        "x-forwarded-for": "203.0.113.5",
        "user-agent": "iPhone",
        "x-vercel-ip-country": "AU",
        "x-vercel-ip-country-region": "VIC",
        "x-vercel-ip-city": "Melbourne",
      }),
      { params: Promise.resolve({ code: "abc1234" }) },
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(prismaMock.qrScan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          qrCodeId: "qr-1",
          userAgent: "iPhone",
          ipHash: expect.any(String),
          country: "AU",
          region: "VIC",
          city: "Melbourne",
        }),
      }),
    );
  });
});
