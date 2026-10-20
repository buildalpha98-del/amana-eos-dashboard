/**
 * Coordinator photos are cropped square so the round frame in parent emails
 * always fits (Daniel, 20 Oct 2026).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 1, resetIn: 1 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));

import { croppedCoordinatorPhoto, isAllowedPhotoSource } from "@/lib/coordinator-photo";
import { GET } from "@/app/api/public/coordinator-photo/route";

const SITE = "https://amanaoshc.com.au/centres/mfis-greenacre/coordinator.jpg";

describe("which photos can be cropped", () => {
  it("our website and our Blob storage only", () => {
    expect(isAllowedPhotoSource(SITE)).toBe(true);
    expect(isAllowedPhotoSource("https://abc.public.blob.vercel-storage.com/p.jpg")).toBe(true);
    expect(isAllowedPhotoSource("https://evil.example.com/p.jpg")).toBe(false);
    expect(isAllowedPhotoSource("http://amanaoshc.com.au/p.jpg")).toBe(false);
    expect(isAllowedPhotoSource("not a url")).toBe(false);
  });

  it("rewrites to the crop route; leaves anything else alone", () => {
    expect(croppedCoordinatorPhoto(SITE, "https://app.test")).toBe(
      `https://app.test/api/public/coordinator-photo?src=${encodeURIComponent(SITE)}`,
    );
    expect(croppedCoordinatorPhoto("https://other.example/p.jpg", "")).toBe("https://other.example/p.jpg");
  });
});

describe("GET /api/public/coordinator-photo", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("turns a tall portrait into a 280×280 square JPEG", async () => {
    const portrait = await sharp({ create: { width: 300, height: 600, channels: 3, background: "#004E64" } }).png().toBuffer();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(portrait)));
    const res = await GET(createRequest("GET", `/api/public/coordinator-photo?src=${encodeURIComponent(SITE)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([280, 280]);
  });

  it("refuses a source that isn't ours, without fetching it", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    const res = await GET(createRequest("GET", `/api/public/coordinator-photo?src=${encodeURIComponent("https://evil.example.com/x.jpg")}`));
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});
