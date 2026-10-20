/**
 * Acknowledgement is per RECORD, not per assessment — pure, client-safe (no
 * Prisma, no I/O), shared by the escalation sweep and the Knox panel so the
 * two can never disagree about whether a record still needs acknowledging.
 *
 * Every re-triage writes a new assessment. A re-triage that does not raise the
 * tier is silenced (`alerted: false`), so the alert people were pinged about
 * lives on an OLDER assessment. The rule: an acknowledgement on any assessment
 * of a record covers every assessment of that record that is the same age or
 * older. Only an assessment created AFTER the newest acknowledged one (i.e. a
 * later alert, which only happens when the tier rose) needs acknowledging again.
 */

export interface AckAssessment {
  createdAt: string | Date;
  alerted: boolean;
  alerts?: ReadonlyArray<{ acknowledgedAt: string | Date | null }>;
}

const toMs = (d: string | Date): number => new Date(d).getTime();

/** True when at least one of the assessment's alert rows is acknowledged. */
export function hasAcknowledgedAlert(a: Pick<AckAssessment, "alerts">): boolean {
  return (a.alerts ?? []).some((al) => !!al.acknowledgedAt);
}

/** `createdAt` (ms) of the record's newest acknowledged assessment, or null. */
export function latestAcknowledgedMs(assessments: ReadonlyArray<AckAssessment>): number | null {
  let latest: number | null = null;
  for (const a of assessments) {
    if (!hasAcknowledgedAlert(a)) continue;
    const ms = toMs(a.createdAt);
    if (Number.isNaN(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return latest;
}

/**
 * True when an acknowledgement on the record already covers an assessment
 * created at `createdAtMs` (an acknowledged assessment of the same age or newer
 * exists). The sweep skips such assessments: their ladder has stopped.
 */
export function coveredByAcknowledgement(createdAtMs: number, latestAckMs: number | null): boolean {
  return latestAckMs !== null && latestAckMs >= createdAtMs;
}

/**
 * The record still needs acknowledging: some assessment alerted, has no
 * acknowledgement of its own, and no acknowledgement on a same-age-or-newer
 * assessment covers it. The panel shows Acknowledge on the LATEST assessment
 * whenever this is true (the ack route stamps the whole record).
 */
export function subjectNeedsAck(assessments: ReadonlyArray<AckAssessment>): boolean {
  const latestAck = latestAcknowledgedMs(assessments);
  return assessments.some(
    (a) => a.alerted && !hasAcknowledgedAlert(a) && !coveredByAcknowledgement(toMs(a.createdAt), latestAck),
  );
}

/** Newest acknowledgement time across every alert of the record, if any. */
export function subjectAcknowledgedAt(assessments: ReadonlyArray<Pick<AckAssessment, "alerts">>): string | null {
  let latest: { ms: number; iso: string } | null = null;
  for (const a of assessments) {
    for (const al of a.alerts ?? []) {
      if (!al.acknowledgedAt) continue;
      const ms = toMs(al.acknowledgedAt);
      if (Number.isNaN(ms)) continue;
      if (!latest || ms > latest.ms) latest = { ms, iso: new Date(ms).toISOString() };
    }
  }
  return latest?.iso ?? null;
}
