import { prisma } from "@/lib/prisma";
import { syncHandbook } from "./handbook";
import { syncHelpArticles } from "./help-article";
import { syncCentreFacts } from "./centre-facts";
import { syncLmsCourse } from "./lms-module";
import { syncPolicyVersion } from "./policy-upload";
import type { UpsertResult } from "../types";

export interface BackfillReport {
  handbook: UpsertResult[];
  helpArticles: UpsertResult[];
  centreFacts: UpsertResult[];
  lmsCourses: UpsertResult[];
  policies: UpsertResult[];
}

/** Everything that has a DB source of truth. Idempotent — unchanged hashes are no-ops. */
export async function runBackfill(): Promise<BackfillReport> {
  const report: BackfillReport = { handbook: [], helpArticles: [], centreFacts: [], lmsCourses: [], policies: [] };
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
  for (const p of policies) {
    if (!p.currentVersionId) continue;
    const r = await syncPolicyVersion(p.currentVersionId);
    if (r) report.policies.push(r);
  }
  return report;
}
