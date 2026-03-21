import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// In-memory rate limiter for cowork auth failures (brute-force protection)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const coworkAuthAttempts = new Map<string, RateLimitEntry>();

/** Max failed auth attempts per IP before blocking */
const MAX_FAILURES = 10;
/** Window duration in ms (15 minutes) */
const WINDOW_MS = 15 * 60 * 1000;

// Periodically clean up stale entries (every 5 minutes)
if (typeof globalThis !== "undefined") {
  const existing = (globalThis as Record<string, unknown>).__coworkRateLimitCleanup;
  if (!existing) {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of coworkAuthAttempts) {
        if (entry.resetAt < now) coworkAuthAttempts.delete(key);
      }
    }, 5 * 60 * 1000);
    if (interval.unref) interval.unref();
    (globalThis as Record<string, unknown>).__coworkRateLimitCleanup = true;
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkCoworkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = coworkAuthAttempts.get(ip);

  if (!entry || entry.resetAt < now) {
    return false; // Not limited
  }

  return entry.count >= MAX_FAILURES;
}

function recordCoworkFailure(ip: string): void {
  const now = Date.now();
  const entry = coworkAuthAttempts.get(ip);

  if (!entry || entry.resetAt < now) {
    coworkAuthAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

function resetCoworkRateLimit(ip: string): void {
  coworkAuthAttempts.delete(ip);
}

// ---------------------------------------------------------------------------
// Cowork authentication
// ---------------------------------------------------------------------------

/**
 * Validates requests from Cowork using a bearer token.
 * Returns a 401 NextResponse on failure, or null if auth passed.
 * Includes rate limiting on failed authentication attempts.
 */
export function authenticateCowork(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request);

  // Check rate limit before processing auth
  if (checkCoworkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests", message: "Rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token !== process.env.COWORK_API_KEY) {
    recordCoworkFailure(ip);
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing API key" },
      { status: 401 },
    );
  }

  // Auth succeeded — clear any failure count for this IP
  resetCoworkRateLimit(ip);

  return null; // Auth passed
}
