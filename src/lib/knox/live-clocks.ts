import type { Prisma, PrismaClient, TriageSubjectType } from "@prisma/client";
import { loadSubject } from "@/lib/knox/load-subject";
import { evaluateRules } from "@/lib/knox/rules";
import type { TriageClock } from "@/lib/knox/types";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The record's compliance clocks as they stand NOW. The clocks stored on an
 * assessment are a snapshot: telling the family (`parentNotified`) or the
 * regulator (`reportedToAuthorityAt`, `regulatorNotifiedAt`) is not a triage
 * trigger, so the stored clock keeps counting down after the duty is met.
 * The rules are pure, so every READ of a clock (inbox, briefing, escalation
 * card) recomputes it from the live record instead. Empty when the record is
 * gone (or soft-deleted).
 */
export async function liveClocksFor(
  db: Db,
  subjectType: TriageSubjectType,
  subjectId: string,
  now: Date,
): Promise<TriageClock[]> {
  const subject = await loadSubject(db, subjectType, subjectId);
  return subject ? evaluateRules(subject, now).clocks : [];
}
