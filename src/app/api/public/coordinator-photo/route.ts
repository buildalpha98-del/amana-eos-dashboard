/**
 * GET /api/public/coordinator-photo?src=<image url> — the coordinator's photo
 * cropped to a square, for the round photo in parent emails (Daniel,
 * 20 Oct 2026: "make sure it's always cropped properly").
 *
 * Email clients ignore `object-fit`, so a portrait photo in a 70×70 circle
 * came out squashed or off-centre. Cropping here — white padding trimmed,
 * then square from the top — means every client shows the same circle.
 *
 * Public because email clients fetch it with no session. `src` must be our
 * website or our Vercel Blob storage: never an arbitrary URL.
 */
import { NextResponse } from "next/server";
import sharp from "sharp";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedPhotoSource } from "@/lib/coordinator-photo";
import { clientIpFromRequest } from "@/lib/activation-qr";

const SIZE = 280; // 2× the 140px it's shown at, for retina screens
const MAX_BYTES = 8 * 1024 * 1024;

export const GET = withApiHandler(async (req) => {
  const src = new URL(req.url).searchParams.get("src") ?? "";
  if (!isAllowedPhotoSource(src)) throw ApiError.badRequest("Unsupported image");

  const ip = clientIpFromRequest(req) ?? "anon";
  const rl = await checkRateLimit(`coordinator-photo:${ip}`, 120, 60_000);
  if (rl.limited) throw new ApiError(429, "Too many requests");

  const res = await fetch(src, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw ApiError.notFound("Image not found");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw ApiError.badRequest("Image too large");

  let out: Buffer;
  try {
    // The website's photos are padded with white (a 1587×2245 canvas around
    // the real photo), so trim that off first, then crop square from the
    // TOP on tall photos — heads are at the top, and centring cut them off.
    const upright = await sharp(bytes).rotate().toBuffer(); // phone orientation flag
    const trimmed = await sharp(upright)
      .trim({ background: "#ffffff", threshold: 30 })
      .toBuffer({ resolveWithObject: true })
      .catch(() => sharp(upright).toBuffer({ resolveWithObject: true })); // nothing to trim
    const { width, height } = trimmed.info;
    out = await sharp(trimmed.data)
      .resize(SIZE, SIZE, { fit: "cover", position: height > width ? "north" : "centre" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw ApiError.badRequest("Not an image");
  }

  return new NextResponse(new Uint8Array(out), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
});
