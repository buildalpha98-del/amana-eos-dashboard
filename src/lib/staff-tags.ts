/**
 * Tag normalisation policy for `User.tags`.
 *
 * Tags are admin-managed, free-form strings used to group staff
 * across services (e.g. "nsw", "lead-trainer", "weekend-only"). All
 * input goes through `normaliseTag` so the storage form is
 * predictable:
 *   - trim outer whitespace
 *   - collapse internal whitespace runs to a single hyphen
 *   - lowercase
 *   - reject anything outside [a-z0-9-]
 *
 * This means "NSW", "nsw", and "  NSW  " all collapse to "nsw" so
 * the filter chip can dedupe across the org without LOWER() tricks
 * in SQL, and "Lead trainer" becomes "lead-trainer".
 */

export const MAX_TAGS_PER_USER = 20;
export const MAX_TAG_LENGTH = 30;
export const MIN_TAG_LENGTH = 1;

/**
 * Returns the canonical form of a tag, or `null` if the input can't
 * be normalised into a valid tag (empty after trim, too long, or
 * contains forbidden characters after whitespace collapse).
 */
export function normaliseTag(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  // Collapse any whitespace run to a single hyphen. We do this before
  // the character-class check so "Lead trainer" → "lead-trainer"
  // rather than rejecting the space.
  const hyphenated = trimmed.replace(/\s+/g, "-");

  if (hyphenated.length < MIN_TAG_LENGTH) return null;
  if (hyphenated.length > MAX_TAG_LENGTH) return null;
  if (!/^[a-z0-9-]+$/.test(hyphenated)) return null;

  return hyphenated;
}

/**
 * Normalise + dedupe a list of incoming tags, enforcing the per-user
 * count limit. Returns:
 *   - `tags`: the canonical list ready to write to the DB
 *   - `rejected`: raw inputs that couldn't be normalised (caller
 *     decides whether to surface or silently drop)
 *
 * Order is preserved; duplicates after normalisation are dropped on
 * second occurrence.
 */
export function normaliseTagList(raw: readonly string[]): {
  tags: string[];
  rejected: string[];
} {
  const tags: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normaliseTag(r);
    if (n === null) {
      rejected.push(r);
      continue;
    }
    if (seen.has(n)) continue;
    seen.add(n);
    tags.push(n);
    if (tags.length >= MAX_TAGS_PER_USER) break;
  }
  return { tags, rejected };
}
