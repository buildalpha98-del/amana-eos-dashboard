/**
 * Pagination helper for API routes.
 *
 * Backward-compatible: returns null if no page/limit params provided,
 * signaling the caller should return the full unpaginated array.
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
