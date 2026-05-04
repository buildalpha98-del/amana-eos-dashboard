/**
 * Pure helpers for picking + ranking the most "leadership-relevant"
 * incidents across services. Used by the leadership-page widget that
 * replaces the cross-service `/incidents` triage page (per the
 * deprecation plan in next-priorities.md Tier 1).
 *
 * Why a custom rank? An admin scanning a leadership dashboard cares
 * about the FRESHEST high-severity items first — a serious incident
 * from yesterday should outrank a moderate one from this morning.
 * The existing `/api/incidents` GET sorts by date descending, which
 * loses the severity signal.
 *
 * 2026-05-04: introduced.
 */

const SEVERITY_WEIGHT: Record<string, number> = {
  serious: 4,
  reportable: 3,
  moderate: 2,
  minor: 1,
};

export type IncidentSeverity = "minor" | "moderate" | "reportable" | "serious";

export interface RankableIncident {
  id: string;
  severity: string;
  incidentDate: Date;
  /** Reportable-to-authority overrides severity rank — if it needs
   *  notifying, an admin needs eyes on it regardless of the label. */
  reportableToAuthority?: boolean;
  /** Soft-deleted rows shouldn't appear; the filter is also enforced
   *  at the SQL boundary but we double-check here for unit-test
   *  invariance. */
  deleted?: boolean;
}

/**
 * Compose a sort key:
 *   - reportable-to-authority always wins
 *   - then severity weight (serious > reportable > moderate > minor)
 *   - then most recent incidentDate first
 *
 * Returns a number where larger = more important (so callers can
 * `.sort((a, b) => priorityScore(b) - priorityScore(a))`).
 *
 * Weight tiers are spaced so each tier dominates the one below:
 *   - reportable boost  = 1_000_000 (millions place)
 *   - severity step     = 10_000    (ten-thousands place)
 *   - recency (days)    = ~20_400   (low-five-digit, drifts ~7 / week)
 */
export function priorityScore(incident: RankableIncident): number {
  const reportableBoost = incident.reportableToAuthority ? 1_000_000 : 0;
  const severityWeight = SEVERITY_WEIGHT[incident.severity] ?? 0;
  // Recency in days-since-epoch — ~20_400 for current dates. Newer
  // dates are larger, drifts ~1/day so it tie-breaks within a severity
  // bucket without overflowing the severity step.
  const dayMs = 24 * 60 * 60 * 1000;
  const recency = Math.floor(incident.incidentDate.getTime() / dayMs);
  return reportableBoost + severityWeight * 10_000 + recency;
}

/**
 * Sort + take the top-N most leadership-relevant incidents from a
 * pre-fetched list. Caller is expected to have already applied
 * service / state scoping at the query layer.
 */
export function pickTopRecentIncidents<T extends RankableIncident>(
  incidents: T[],
  limit: number,
): T[] {
  return incidents
    .filter((i) => !i.deleted)
    .slice() // defensive: don't mutate caller's array
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, limit);
}
