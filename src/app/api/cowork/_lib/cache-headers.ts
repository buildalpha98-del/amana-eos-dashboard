import { NextResponse } from "next/server";

/**
 * Add cache headers to Cowork API responses.
 *
 * Sets Cache-Control for CDN caching and ETag for client-side validation.
 * Default TTL: 60 seconds (good for read endpoints polled by Cowork).
 */
export function withCacheHeaders(
  response: NextResponse,
  ttlSeconds = 60,
): NextResponse {
  response.headers.set(
    "Cache-Control",
    `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`,
  );

  return response;
}

/**
 * Generate a weak ETag from response data.
 * Useful for frequently polled endpoints to reduce bandwidth.
 */
export function withETag(
  response: NextResponse,
  data: unknown,
): NextResponse {
  // Simple hash: use JSON length + a few characters as fingerprint
  const json = JSON.stringify(data);
  const etag = `W/"${json.length.toString(36)}-${hashCode(json).toString(36)}"`;

  response.headers.set("ETag", etag);
  return response;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
