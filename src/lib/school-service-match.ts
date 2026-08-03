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
 * Scored against the school rather than symmetrically: a service name may
 * carry extra words ("Amana OSHC Minaret Springvale Before & After"),
 * and penalising it for being more specific would lose real matches.
 */
export function matchScore(schoolName: string, serviceName: string): number {
  const school = tokenise(schoolName);
  const service = new Set(tokenise(serviceName));
  if (school.length === 0) return 0;
  const hits = school.filter((w) => service.has(w)).length;
  return hits / school.length;
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
 * Returns null when nothing clears the threshold OR when the top two are
 * tied — "Minaret" alone shouldn't silently pick Springvale over Officer
 * just because it sorts first.
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

  const scored = services
    .map((s) => ({ s, score: matchScore(schoolName, s.name) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MATCH_THRESHOLD) return none;

  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score === best.score) {
    // A tie is genuine ambiguity — say so rather than coin-flipping a
    // child onto one of two centres.
    return { ...none, score: best.score, ambiguous: true };
  }

  return {
    serviceId: best.s.id,
    serviceName: best.s.name,
    score: best.score,
    ambiguous: false,
  };
}
