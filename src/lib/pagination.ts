/**
 * Pagination helper for API routes.
 *
 * Backward-compatible: returns null if no page/limit params provided,
 * signaling the caller should return the full unpaginated array.
 *
 * @example
 * ```ts
 * const pg = parsePagination(searchParams);
 * const items = await prisma.model.findMany({ skip: pg?.skip, take: pg?.limit });
 * const total = await prisma.model.count({ where });
 * return NextResponse.json(pg ? paginatedResponse(items, total, pg) : items);
 * ```
 */
export function parsePagination(searchParams: URLSearchParams) {
  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");

  // No pagination requested — caller returns full array (backward compat)
  if (!rawPage && !rawLimit) return null;

  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(100, Math.max(1, Number(rawLimit) || 50));

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Parse and clamp a numeric query param for cursor-based pagination.
 * Protects against NaN (e.g. `?limit=abc`), negative numbers, and Infinity.
 */
export function safeLimit(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * Standard paginated response envelope.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  pg: { page: number; limit: number },
) {
  return {
    data,
    total,
    page: pg.page,
    limit: pg.limit,
    totalPages: Math.ceil(total / pg.limit),
  };
}
