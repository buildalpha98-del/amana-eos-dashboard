import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  publicBaseUrl,
  buildScanUrl,
  buildDestinationWithUtm,
  generateUniqueShortCode,
  hashIp,
  clientIpFromRequest,
  geolocationFromRequest,
} from "@/lib/activation-qr";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("publicBaseUrl", () => {
  it("falls back to default when env unset", () => {
    expect(publicBaseUrl()).toBe("https://dashboard.amanaoshc.com.au");
  });
  it("uses env without trailing slash", () => {
    process.env.NEXTAUTH_URL = "https://amanaoshc.company/";
    expect(publicBaseUrl()).toBe("https://amanaoshc.company");
  });
});

describe("buildScanUrl", () => {
  it("composes base + /a/{code}", () => {
    process.env.NEXTAUTH_URL = "https://amanaoshc.company";
    expect(buildScanUrl("abc1234")).toBe("https://amanaoshc.company/a/abc1234");
  });
});

describe("buildDestinationWithUtm", () => {
  it("appends utm_source/medium/campaign when missing", () => {
    const out = buildDestinationWithUtm("https://example.com/enquire", "abc1234");
    const url = new URL(out);
    expect(url.searchParams.get("utm_source")).toBe("qr");
    expect(url.searchParams.get("utm_medium")).toBe("activation");
    expect(url.searchParams.get("utm_campaign")).toBe("abc1234");
  });
  it("preserves existing utm params", () => {
    const out = buildDestinationWithUtm("https://example.com/?utm_campaign=existing", "abc1234");
    expect(new URL(out).searchParams.get("utm_campaign")).toBe("existing");
  });
  it("returns input unchanged for non-URL strings", () => {
    expect(buildDestinationWithUtm("not a url", "x")).toBe("not a url");
  });
});

describe("generateUniqueShortCode", () => {
  it("returns a 7-char code on first try when no collision", async () => {
    prismaMock.qrCode.findUnique.mockResolvedValue(null);
    const code = await generateUniqueShortCode();
    expect(code).toHaveLength(7);
    expect(/^[a-z0-9]+$/.test(code)).toBe(true);
  });
  it("retries on collision", async () => {
    prismaMock.qrCode.findUnique
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce(null);
    const code = await generateUniqueShortCode();
    expect(code).toHaveLength(7);
    expect(prismaMock.qrCode.findUnique).toHaveBeenCalledTimes(2);
  });
  it("throws after max attempts", async () => {
    prismaMock.qrCode.findUnique.mockResolvedValue({ id: "x" });
    await expect(generateUniqueShortCode(2)).rejects.toThrow(/unique/);
  });
});

describe("geolocationFromRequest", () => {
  it("returns nulls when no Vercel headers present", () => {
    const req = new Request("https://x");
    expect(geolocationFromRequest(req)).toEqual({ country: null, region: null, city: null });
  });
  it("decodes URL-encoded headers", () => {
    const req = new Request("https://x", {
      headers: {
        "x-vercel-ip-country": "AU",
        "x-vercel-ip-country-region": "NSW",
        "x-vercel-ip-city": "Sydney",
      },
    });
    expect(geolocationFromRequest(req)).toEqual({ country: "AU", region: "NSW", city: "Sydney" });
  });
});

describe("hashIp", () => {
  it("returns null for null/empty", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp("")).toBeNull();
  });
  it("returns deterministic hash for same input", () => {
    const a = hashIp("203.0.113.1");
    const b = hashIp("203.0.113.1");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });
  it("returns different hash for different inputs", () => {
    expect(hashIp("203.0.113.1")).not.toBe(hashIp("203.0.113.2"));
  });
});

describe("clientIpFromRequest", () => {
  it("reads first x-forwarded-for entry", () => {
    const req = new Request("https://x", { headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" } });
    expect(clientIpFromRequest(req)).toBe("203.0.113.1");
  });
  it("falls back to x-real-ip", () => {
    const req = new Request("https://x", { headers: { "x-real-ip": "203.0.113.5" } });
    expect(clientIpFromRequest(req)).toBe("203.0.113.5");
  });
  it("returns null when no header", () => {
    const req = new Request("https://x");
    expect(clientIpFromRequest(req)).toBeNull();
  });
});
