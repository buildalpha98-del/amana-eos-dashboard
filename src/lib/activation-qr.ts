import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Public scan URL pattern: `{baseUrl}/a/{shortCode}`. Always built from
 * NEXTAUTH_URL so dev / staging / prod all generate correct QRs.
 */
export function publicBaseUrl(): string {
  const base = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";
  return base.replace(/\/+$/, "");
}

export function buildScanUrl(shortCode: string): string {
  return `${publicBaseUrl()}/a/${shortCode}`;
}

/**
 * Append our standard UTM params so any downstream system that reads them
 * (parent portal enquiry form, GA, etc.) can attribute the visit back to
 * the activation.
 */
export function buildDestinationWithUtm(destination: string, shortCode: string): string {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination; // not a parseable URL; return as-is
  }
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "qr");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "activation");
  if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", shortCode);
  return url.toString();
}

const SHORT_CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // omit 0/o/1/l/i to avoid confusion
const SHORT_CODE_LENGTH = 7;

function generateRawCode(): string {
  const bytes = randomBytes(SHORT_CODE_LENGTH * 2);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Generate a unique 7-char base32-ish short code, retrying on the unlikely
 * collision (1 in ~34 billion at SHORT_CODE_LENGTH=7).
 */
export async function generateUniqueShortCode(maxAttempts = 5): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateRawCode();
    const existing = await prisma.qrCode.findUnique({
      where: { shortCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique QR short code after multiple attempts");
}

/**
 * Extract Vercel-provided geolocation from request headers. Returns nulls
 * for fields that aren't present (local dev, non-Vercel deploy).
 */
export function geolocationFromRequest(req: Request): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    country: decode(req.headers.get("x-vercel-ip-country")),
    region: decode(req.headers.get("x-vercel-ip-country-region")),
    city: decode(req.headers.get("x-vercel-ip-city")),
  };
}

/**
 * SHA-256 of (ip + secret salt). Stored in QrScan.ipHash so we can
 * dedupe scans without retaining raw IPs.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.NEXTAUTH_SECRET || "fallback-salt-do-not-use-in-prod";
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex").slice(0, 32);
}

/**
 * Resolve the client IP from a Next.js request. Falls back to null when not
 * derivable (local dev, no proxy header).
 */
export function clientIpFromRequest(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}
