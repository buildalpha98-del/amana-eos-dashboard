import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Cowork authentication
// ---------------------------------------------------------------------------

/**
 * Validates requests from Cowork using a bearer token.
 * Returns a 401 NextResponse on failure, or null if auth passed.
 * Includes rate limiting on failed authentication attempts (10 req/15min per IP).
 */
export async function authenticateCowork(request: NextRequest): Promise<NextResponse | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.COWORK_API_KEY) {
    // Rate limit ONLY failed auth attempts to prevent brute-force (10/15min per IP)
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = await checkRateLimit(`cowork-auth-fail:${ip}`, 10, 15 * 60 * 1000);
    if (rl.limited) {
      return NextResponse.json(
        { error: "Too many failed authentication attempts" },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null; // Auth passed — no rate limit on valid requests
}

// ---------------------------------------------------------------------------
// API versioning helpers
// ---------------------------------------------------------------------------

/**
 * Sets standard version headers on a cowork API response.
 *
 * @param res - The NextResponse to annotate
 * @param version - API version number (1 or 2)
 * @param options.deprecated - If true, sets X-API-Deprecated and Sunset headers
 * @param options.sunsetDate - ISO date string for the Sunset header (default: 90 days from now)
 */
export function setVersionHeaders(
  res: NextResponse,
  version: number = 1,
  options?: { deprecated?: boolean; sunsetDate?: string },
): NextResponse {
  res.headers.set("X-API-Version", String(version));

  if (options?.deprecated) {
    res.headers.set("X-API-Deprecated", "true");
    const sunset = options.sunsetDate ?? defaultSunsetDate();
    res.headers.set("Sunset", sunset);
  }

  return res;
}

function defaultSunsetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toUTCString();
}
