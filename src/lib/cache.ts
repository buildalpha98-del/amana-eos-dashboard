/**
 * Server-side Redis cache for expensive computations.
 * Uses Upstash Redis (same instance as rate limiting).
 * Falls back to in-memory cache when Redis is not configured.
 */

import { Redis } from "@upstash/redis";

// Lazy singleton Redis instance
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// In-memory fallback for local dev
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

/**
 * Cache-aside pattern: check cache first, fetch and store on miss.
 *
 * @param key        - Cache key (e.g. "dashboard:stats")
 * @param ttlSeconds - Time-to-live in seconds
 * @param fetchFn    - Async function to fetch fresh data on cache miss
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cacheKey = `cache:${key}`;
  const r = getRedis();

  if (r) {
    try {
      const cached = await r.get<T>(cacheKey);
      if (cached !== null && cached !== undefined) return cached;
    } catch {
      // Redis unavailable — fall through to fetch
    }
  } else {
    // In-memory fallback
    const entry = memoryCache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  }

  const data = await fetchFn();

  // Store in cache (fire-and-forget for Redis)
  if (r) {
    r.set(cacheKey, JSON.stringify(data), { ex: ttlSeconds }).catch(() => {}); // Intentional: cache write is best-effort; Redis outages must not break the request (fetchFn already succeeded)
  } else {
    memoryCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  return data;
}

/**
 * Invalidate cache entries matching a pattern.
 * For Redis: uses SCAN + DEL. For memory: iterates keys.
 *
 * @param pattern - Glob pattern (e.g. "dashboard:*", "health:*")
 */
export async function invalidateCache(pattern: string): Promise<void> {
  const fullPattern = `cache:${pattern}`;
  const r = getRedis();

  if (r) {
    try {
      // Upstash Redis supports keys() for pattern matching
      const keys = await r.keys(fullPattern);
      if (keys.length > 0) {
        await r.del(...keys);
      }
    } catch {
      // Ignore Redis errors on invalidation
    }
  } else {
    // In-memory fallback
    for (const key of memoryCache.keys()) {
      // Simple glob: convert * to regex
      const regex = new RegExp(
        "^" + fullPattern.replace(/\*/g, ".*") + "$",
      );
      if (regex.test(key)) memoryCache.delete(key);
    }
  }
}

/**
 * Invalidate a single cache key.
 */
export async function invalidateCacheKey(key: string): Promise<void> {
  const cacheKey = `cache:${key}`;
  const r = getRedis();

  if (r) {
    r.del(cacheKey).catch(() => {}); // Intentional: cache invalidation is best-effort; TTL will expire stale entries anyway
  } else {
    memoryCache.delete(cacheKey);
  }
}
