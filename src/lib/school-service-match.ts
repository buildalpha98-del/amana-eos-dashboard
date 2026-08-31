/**
 * Match the school a family picked on the enrolment form to one of our
 * services.
 *
 * WHY THIS EXISTS: the enrolment form records a SCHOOL ("Minaret College
 * Springvale"), but every operational view is keyed to a SERVICE ("Amana
 * OSHC Minaret Springvale"). Nothing joined the two, so submitted
 * enrolments were created with serviceId null — the child existed but
 * belonged to no centre, and therefore never appeared in that centre's
 * children list, roll, or billing.
 *
 * Deliberately conservative. A WRONG match is far worse than no match:
 * it puts a child on the wrong centre's roll, in the wrong ratio count,
 * and on the wrong invoice. When confidence is low this returns null and
 * the enrolment waits for a human, which is a visible, fixable state.
 */

/** Words that carry no signal — every service and school shares them. */
const STOPWORDS = new Set([
  "amana",
  "oshc",
  "the",
  "school",
  "college",
  "grammar",
  "campus",
  "islamic",
  "academy",
  "centre",
  "center",
  "care",
  "outside",
  "hours",
]);

export function tokenise(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Fraction of the SCHOOL's meaningful words found in the service name.
 *
 * Kept for the simple case and for tests, but NOT the primary signal —
 * see matchSchoolToService. Plain overlap fails exactly where it matters:
 * "AIA KKCC" vs "Amana OSHC AIA Coburg" scores 0.5 in both directions
 * because each side carries one word the other lacks, yet "AIA" plainly
 * identifies the centre.
 */
export function matchScore(schoolName: string, serviceName: string): number {
  const school = tokenise(schoolName);
  const service = new Set(tokenise(serviceName));
  if (school.length === 0) return 0;
  const hits = school.filter((w) => service.has(w)).length;
  return hits / school.length;
}

/**
 * How identifying a word is across the whole service list.
 *
 * A word in exactly ONE service name ("springvale", "aia", "taqwa")
 * pins the centre down. A word in several ("minaret", "malek") narrows
 * it but cannot decide between campuses. This is the difference plain
 * overlap can't see, and it's what makes the match work on the real
 * names rather than idealised ones.
 */
export function buildTokenIndex(
  services: ServiceLike[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const svc of services) {
    for (const t of tokenise(svc.name)) {
      const set = index.get(t) ?? new Set<string>();
      set.add(svc.id);
      index.set(t, set);
    }
  }
  return index;
}

export interface ServiceLike {
  id: string;
  name: string;
}

export interface MatchResult {
  serviceId: string | null;
  serviceName: string | null;
  score: number;
  /** True when two or more services scored equally well. */
  ambiguous: boolean;
}

/** Below this we don't guess. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Best service for a school name, or null.
 *
 * Two passes:
 *
 *  1. UNIQUE TOKEN. If the school shares a word with exactly one service
 *     and that word appears in no other service, that's the centre.
 *     Catches "AIA KKCC" -> "Amana OSHC AIA Coburg" and "Al-Taqwa
 *     College" -> "Amana OSHC Taqwa", which plain overlap misses.
 *  2. OVERLAP. Otherwise fall back to word overlap, taking the better of
 *     the two directions so a service isn't penalised for a longer name.
 *
 * Still refuses to guess. If two services tie, or nothing clears the
 * threshold, this returns null and staff assign it — a wrong match puts a
 * child on the wrong roll, ratio and invoice, which is far worse than an
 * enrolment somebody has to place by hand.
 */
export function matchSchoolToService(
  schoolName: string | null | undefined,
  services: ServiceLike[],
): MatchResult {
  const none: MatchResult = {
    serviceId: null,
    serviceName: null,
    score: 0,
    ambiguous: false,
  };
  if (!schoolName?.trim() || services.length === 0) return none;

  const schoolTokens = tokenise(schoolName);
  if (schoolTokens.length === 0) return none;

  // ── Pass 1: a word that belongs to exactly one service ──
  const index = buildTokenIndex(services);
  const pinned = new Set<string>();
  for (const t of schoolTokens) {
    const owners = index.get(t);
    if (owners && owners.size === 1) pinned.add([...owners][0]);
  }
  if (pinned.size === 1) {
    const id = [...pinned][0];
    const svc = services.find((s) => s.id === id)!;
    return {
      serviceId: svc.id,
      serviceName: svc.name,
      score: 1,
      ambiguous: false,
    };
  }
  if (pinned.size > 1) {
    // The school name points at two different centres at once — that's a
    // naming problem a human needs to look at, not something to average.
    return { ...none, ambiguous: true };
  }

  // ── Pass 2: best overlap, whichever direction reads better ──
  const scored = services
    .map((s) => ({
      s,
      score: Math.max(
        matchScore(schoolName, s.name),
        matchScore(s.name, schoolName),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MATCH_THRESHOLD) return none;

  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score === best.score) {
    return { ...none, score: best.score, ambiguous: true };
  }

  return {
    serviceId: best.s.id,
    serviceName: best.s.name,
    score: best.score,
    ambiguous: false,
  };
}
