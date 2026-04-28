/**
 * Deep-merge two section payloads (objects of nested objects + scalars + arrays).
 *
 * Used by PATCH /api/centre-avatars/[serviceId] so a partial save (e.g. the
 * form only sends one updated subsection) can never wipe sibling fields that
 * weren't in the payload.
 *
 * Rules:
 * - Both inputs must be plain objects (or undefined). Anything else → fall back
 *   to `next` (replace).
 * - Each top-level key in the merged output is the union of both sides.
 * - For each shared key:
 *     - If both values are plain objects → recurse.
 *     - Otherwise → `next`'s value wins (including null, which clears the field;
 *       and arrays, which fully replace — list semantics are clearer that way).
 * - Keys present in `previous` but NOT in `next` are PRESERVED (this is the
 *   key safety property: omitting a field never wipes it).
 *
 * Use `null` in the next payload to explicitly clear a field; use undefined or
 * omit it to leave the previous value in place.
 */
export function deepMergeSection(
  previous: unknown,
  next: unknown,
): Record<string, unknown> | unknown[] | unknown {
  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return next;
  }
  const out: Record<string, unknown> = { ...previous };
  for (const [key, nextValue] of Object.entries(next)) {
    const prevValue = previous[key];
    if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
      out[key] = deepMergeSection(prevValue, nextValue);
    } else {
      out[key] = nextValue;
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
