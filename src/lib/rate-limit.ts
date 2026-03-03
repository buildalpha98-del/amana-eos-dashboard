/**
 * Simple in-memory rate limiter for login attempts.
 * In production with multiple instances, use Redis instead.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt < now) {
      attempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if a key (IP or email) is rate limited.
 * @param key - identifier (IP address or email)
 * @param maxAttempts - max attempts in the window (default 5)
 * @param windowMs - time window in ms (default 15 minutes)
 * @returns { limited: boolean, remaining: number, resetIn: number }
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
): { limited: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    // First attempt or window expired
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxAttempts - 1, resetIn: windowMs };
  }

  entry.count++;

  if (entry.count > maxAttempts) {
    return {
      limited: true,
      remaining: 0,
      resetIn: entry.resetAt - now,
    };
  }

  return {
    limited: false,
    remaining: maxAttempts - entry.count,
    resetIn: entry.resetAt - now,
  };
}

/**
 * Reset rate limit for a key (e.g., on successful login).
 */
export function resetRateLimit(key: string) {
  attempts.delete(key);
}
