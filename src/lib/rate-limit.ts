/**
 * Rate limiter for login attempts and other abuse-prevention scenarios.
 *
 * Uses Upstash Redis in production for persistence across serverless
 * invocations. Falls back to in-memory for local development when the
 * UPSTASH env vars are not set.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// 1. Upstash Redis rate limiter (production)
// ---------------------------------------------------------------------------

let ratelimit: Ratelimit | null = null;

function getUpstashRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    // 5 requests per 15-minute sliding window (matches original behaviour)
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    analytics: true,
    prefix: "ratelimit:login",
  });

  return ratelimit;
}

// ---------------------------------------------------------------------------
// 2. In-memory fallback (local dev only)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryAttempts = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes (only runs in long-lived dev server)
if (typeof globalThis !== "undefined") {
  const existing = (globalThis as Record<string, unknown>).__rateLimitCleanup;
  if (!existing) {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of memoryAttempts) {
        if (entry.resetAt < now) memoryAttempts.delete(key);
      }
    }, 5 * 60 * 1000);
    // Don't keep the process alive just for cleanup
    if (interval.unref) interval.unref();
    (globalThis as Record<string, unknown>).__rateLimitCleanup = true;
  }
}

function checkMemory(
  key: string,
  maxAttempts: number,
  windowMs: number,
): { limited: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = memoryAttempts.get(key);

  if (!entry || entry.resetAt < now) {
    memoryAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxAttempts - 1, resetIn: windowMs };
  }

  entry.count++;

  if (entry.count > maxAttempts) {
    return { limited: true, remaining: 0, resetIn: entry.resetAt - now };
  }

  return {
    limited: false,
    remaining: maxAttempts - entry.count,
    resetIn: entry.resetAt - now,
  };
}

function resetMemory(key: string) {
  memoryAttempts.delete(key);
}

// ---------------------------------------------------------------------------
// 3. Public API (same signature as before — drop-in replacement)
// ---------------------------------------------------------------------------

/**
 * Check if a key (email, IP, etc.) is rate-limited.
 *
 * @param key          - identifier (e.g. `login:user@example.com`)
 * @param maxAttempts  - max attempts in the window (default 5)
 * @param windowMs     - time window in ms (default 15 minutes)
 * @returns `{ limited, remaining, resetIn }`
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): Promise<{ limited: boolean; remaining: number; resetIn: number }> {
  const upstash = getUpstashRatelimit();

  if (upstash) {
    const { success, remaining, reset } = await upstash.limit(key);
    return {
      limited: !success,
      remaining,
      resetIn: Math.max(0, reset - Date.now()),
    };
  }

  // Fallback: in-memory (dev only)
  return checkMemory(key, maxAttempts, windowMs);
}

// ---------------------------------------------------------------------------
// 4. API key rate limiter (100 req / 1 min per key)
// ---------------------------------------------------------------------------

let apiKeyRatelimit: Ratelimit | null = null;

function getApiKeyRatelimit(): Ratelimit | null {
  if (apiKeyRatelimit) return apiKeyRatelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  apiKeyRatelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(100, "1 m"),
    analytics: true,
    prefix: "ratelimit:apikey",
  });

  return apiKeyRatelimit;
}

/**
 * Check if an API key has exceeded its rate limit (100 req / min).
 */
export async function checkApiKeyRateLimit(
  keyId: string,
): Promise<{ limited: boolean; remaining: number; resetIn: number }> {
  const upstash = getApiKeyRatelimit();

  if (upstash) {
    const { success, remaining, reset } = await upstash.limit(`apikey:${keyId}`);
    return {
      limited: !success,
      remaining,
      resetIn: Math.max(0, reset - Date.now()),
    };
  }

  // Fallback: in-memory (dev only) — 100 requests per 60 seconds
  return checkMemory(`apikey:${keyId}`, 100, 60_000);
}

// ---------------------------------------------------------------------------
// 5. Reset
// ---------------------------------------------------------------------------

/**
 * Reset rate-limit for a key (e.g. on successful login).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const upstash = getUpstashRatelimit();

  if (upstash) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    // Remove all sliding-window keys for this identifier
    const keys = await redis.keys(`ratelimit:login:${key}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return;
  }

  resetMemory(key);
}
