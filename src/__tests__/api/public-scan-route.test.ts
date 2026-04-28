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
  prismaMock.activationScan.create.mockResolvedValue({ id: "scan-1" });
});

function buildReq(headers: Record<string, string> = {}) {
  return new NextRequest(new URL("https://amanaoshc.company/a/somecode"), { headers });
}

describe("GET /a/[code]", () => {
  it("redirects to fallback when code unknown", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue(null);
    const res = await GET(buildReq(), { params: Promise.resolve({ code: "missing" }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/enquire");
  });

  it("redirects to destination URL with utm params appended when configured", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      qrShortCode: "abc1234",
      qrDestinationUrl: "https://amanaoshc.company/enquire?serviceId=s-1",
      service: { id: "s-1", name: "Centre A", code: "AAA" },
    });
    const res = await GET(buildReq({ "user-agent": "iPhone" }), { params: Promise.resolve({ code: "abc1234" }) });
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("utm_source=qr");
    expect(location).toContain("utm_medium=activation");
    expect(location).toContain("utm_campaign=abc1234");
    expect(location).toContain("serviceId=s-1");
  });

  it("redirects to fallback enquire page with serviceId pre-filled when no destination", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      qrShortCode: "abc1234",
      qrDestinationUrl: null,
      service: { id: "s-1", name: "Centre A", code: "AAA" },
    });
    const res = await GET(buildReq(), { params: Promise.resolve({ code: "abc1234" }) });
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/enquire");
    expect(location).toContain("serviceId=s-1");
    expect(location).toContain("utm_campaign=abc1234");
  });

  it("logs a scan with hashed IP when x-forwarded-for present", async () => {
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({
      id: "a-1",
      qrShortCode: "abc1234",
      qrDestinationUrl: null,
      service: { id: "s-1", name: "Centre A", code: "AAA" },
    });
    await GET(
      buildReq({ "x-forwarded-for": "203.0.113.5", "user-agent": "iPhone" }),
      { params: Promise.resolve({ code: "abc1234" }) },
    );
    // give the fire-and-forget logging a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(prismaMock.activationScan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activationId: "a-1",
          userAgent: "iPhone",
          ipHash: expect.any(String),
        }),
      }),
    );
  });
});
