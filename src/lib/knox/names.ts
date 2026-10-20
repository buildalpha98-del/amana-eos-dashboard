/**
 * Name handling for Knox — pure, client-safe (no Prisma, no I/O). The model
 * redactor trusts `firstNameOf` to return the first name ONLY, so a surname
 * must never come out of it.
 */

/** Non-letter characters at either end of a token ("Hassan," → "Hassan", "(Ali)" → "Ali"). */
const EDGE_NON_LETTERS = /^[^\p{L}]+|[^\p{L}]+$/gu;

function cleanToken(token: string): string {
  return token.replace(EDGE_NON_LETTERS, "");
}

/** Whitespace tokens of a name with punctuation trimmed from their edges; empties dropped. */
export function nameTokensOf(name: string | null | undefined): string[] {
  return (name ?? "").split(/\s+/).map(cleanToken).filter(Boolean);
}

/**
 * The first name, or null. Registers hold both "Omar Hassan" and the
 * "Surname, First" form ("Hassan, Omar"), so with a comma the part AFTER it is
 * the given name; then the first whitespace token, punctuation trimmed from
 * its edges (inner apostrophes and hyphens stay: "O'Neill", "Mary-Jane").
 */
export function firstNameOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const comma = name.indexOf(",");
  const given = comma >= 0 ? name.slice(comma + 1) : name;
  return nameTokensOf(given)[0] ?? null;
}

/**
 * Every token of the name except the first name (once): the surname(s) and
 * middle names a redactor must scrub. Order-agnostic, so "Hassan, Omar" and
 * "Omar Hassan" both yield ["Hassan"].
 */
export function otherNameTokensOf(name: string | null | undefined): string[] {
  const tokens = nameTokensOf(name);
  const first = firstNameOf(name);
  const i = first === null ? -1 : tokens.indexOf(first);
  return i >= 0 ? [...tokens.slice(0, i), ...tokens.slice(i + 1)] : tokens;
}
