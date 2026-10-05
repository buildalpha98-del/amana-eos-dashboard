import { prisma } from "@/lib/prisma";
import { syncHandbook } from "./handbook";
import { syncHelpArticles } from "./help-article";
import { syncCentreFacts } from "./centre-facts";
import { syncLmsCourse } from "./lms-module";
import { syncPolicyVersion } from "./policy-upload";
import { sourceNeedsIndex } from "../pipeline";
import type { UpsertResult } from "../types";

/**
 * Policy PDFs per run. Each one is a Blob download + PDF extraction BEFORE
 * the hash check can say "unchanged", so an unbounded walk over a 100+
 * policy library blows the 300 s route budget and leaves an orphaned run.
 * Pending policies (no row, failed/unfinished index, keyword-only with a
 * key now present) go first; the rest are re-verified as capacity allows.
 */
export const POLICY_BATCH_SIZE = 25;

export interface BackfillReport {
  handbook: UpsertResult[];
  helpArticles: UpsertResult[];
  centreFacts: UpsertResult[];
  lmsCourses: UpsertResult[];
  policies: UpsertResult[];
  /** Pending policies NOT reached this run — the console says "run Sync again" while > 0. */
  policiesRemaining: number;
}

/** Everything that has a DB source of truth. Idempotent — unchanged hashes are no-ops. */
export async function runBackfill(): Promise<BackfillReport> {
  const report: BackfillReport = { handbook: [], helpArticles: [], centreFacts: [], lmsCourses: [], policies: [], policiesRemaining: 0 };
  report.handbook = await syncHandbook();
  report.helpArticles = await syncHelpArticles();

  const services = await prisma.service.findMany({ where: { status: "active" }, select: { id: true } });
  for (const s of services) {
    const r = await syncCentreFacts(s.id);
    if (r) report.centreFacts.push(r);
  }

  const courses = await prisma.lMSCourse.findMany({ where: { status: "published", deleted: false }, select: { id: true } });
  for (const c of courses) report.lmsCourses.push(...(await syncLmsCourse(c.id)));

  const policies = await prisma.policyDocument.findMany({
    where: { isArchived: false, currentVersionId: { not: null } },
    select: { currentVersionId: true },
  });
  const versionIds = policies.map((p) => p.currentVersionId).filter((id): id is string => id !== null);
  const stored = await prisma.knowledgeSource.findMany({
    where: { sourceKind: "policy_upload", externalId: { in: versionIds } },
    select: { externalId: true, indexedAt: true, indexError: true, embedded: true },
  });
  const byVersion = new Map(stored.map((s) => [s.externalId, s]));
  const isPending = (id: string) => {
    const row = byVersion.get(id);
    return !row || sourceNeedsIndex(row);
  };
  const pending = versionIds.filter(isPending);
  const settled = versionIds.filter((id) => !isPending(id));
  report.policiesRemaining = Math.max(0, pending.length - POLICY_BATCH_SIZE);
  for (const versionId of [...pending, ...settled].slice(0, POLICY_BATCH_SIZE)) {
    const r = await syncPolicyVersion(versionId);
    if (r) report.policies.push(r);
  }
  return report;
}
