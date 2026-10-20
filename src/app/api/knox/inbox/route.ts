import { NextResponse } from "next/server";
import type { TriageSubjectType, TriageTier } from "@prisma/client";
import { getCentreScope } from "@/lib/centre-scope";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";
import { withApiAuth } from "@/lib/server-auth";
import {
  KNOX_ROLES,
  assertInScope,
  parseSubjectParam,
  parseTiersForParam,
  scopeWhere,
} from "../_lib";

const DAY_MS = 86_400_000;

const ALERT_SELECT = {
  id: true,
  channel: true,
  escalationLevel: true,
  recipientUserId: true,
  sentAt: true,
  delivered: true,
  acknowledgedAt: true,
} as const;

/** The service a subject belongs to: its latest assessment's, else the record's own. */
async function subjectServiceId(type: TriageSubjectType, id: string): Promise<string | null> {
  const latest = await prisma.triageAssessment.findFirst({
    where: { subjectType: type, subjectId: id },
    orderBy: { createdAt: "desc" },
    select: { serviceId: true },
  });
  if (latest) return latest.serviceId;
  const select = { serviceId: true } as const;
  switch (type) {
    case "incident":
      return (await prisma.incidentRecord.findUnique({ where: { id }, select }))?.serviceId ?? null;
    case "complaint":
      return (await prisma.complaintRecord.findUnique({ where: { id }, select }))?.serviceId ?? null;
    case "staff_incident":
      return (await prisma.staffIncidentReport.findUnique({ where: { id }, select }))?.serviceId ?? null;
  }
}

/**
 * GET /api/knox/inbox
 *   (default)                    → { awaitingAck, openCards, recent, failedJobs }
 *   ?subject=<type>:<id>         → …plus subject: { assessments, cards }
 *   ?tiersFor=<type>:<id>,<id>…  → { tiers: Record<id, tier | null> } only
 *
 * Everything is scoped by the caller's centres. Out-of-scope subjects are 404
 * (subject mode) or `null` (tiersFor).
 */
export const GET = withApiAuth(
  async (req, session) => {
    const { searchParams } = new URL(req.url);
    const { serviceIds } = await getCentreScope(session);
    const scope = scopeWhere(serviceIds);

    // ── tiersFor: one request per table, badges only ──────────────────
    const tiersFor = searchParams.get("tiersFor");
    if (tiersFor !== null) {
      const { type, ids } = parseTiersForParam(tiersFor);
      const rows = await prisma.triageAssessment.findMany({
        where: { subjectType: type, subjectId: { in: ids }, ...scope },
        orderBy: { createdAt: "desc" },
        select: { subjectId: true, tier: true },
      });
      const tiers: Record<string, TriageTier | null> = Object.fromEntries(ids.map((id) => [id, null]));
      const seen = new Set<string>();
      for (const row of rows) {
        // Newest first, so the first row per subject is its latest tier.
        if (seen.has(row.subjectId)) continue;
        seen.add(row.subjectId);
        tiers[row.subjectId] = row.tier;
      }
      return NextResponse.json({ tiers });
    }

    // ── subject (optional) — validated and scope-checked up front ─────
    const subjectParam = searchParams.get("subject");
    const subject = subjectParam !== null ? parseSubjectParam(subjectParam) : null;
    if (subject) {
      const serviceId = await subjectServiceId(subject.type, subject.id);
      assertInScope(serviceIds, serviceId);
    }

    const now = new Date();
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const seesFailedJobs = isAdminRole(session.user.role);

    const [awaitingAck, openCards, recent, failedJobs, subjectAssessments, subjectCards] = await Promise.all([
      prisma.triageAssessment.findMany({
        // 7-day lookback: the sweep only escalates within 24 h, and an alert
        // older than a week is history, not a to-do.
        where: {
          alerted: true,
          createdAt: { gte: since },
          alerts: { none: { acknowledgedAt: { not: null } } },
          ...scope,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { alerts: { select: ALERT_SELECT }, service: { select: { name: true } } },
      }),
      prisma.pendingAction.findMany({
        where: { committedAt: null, dismissedAt: null, expiresAt: { gt: now }, ...scope },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.triageAssessment.findMany({
        where: { createdAt: { gte: since }, ...scope },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { service: { select: { name: true } } },
      }),
      seesFailedJobs
        ? prisma.triageJob.findMany({
            where: { status: "failed", ...scope },
            orderBy: { updatedAt: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
      subject
        ? prisma.triageAssessment.findMany({
            where: { subjectType: subject.type, subjectId: subject.id, ...scope },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: { alerts: { select: ALERT_SELECT } },
          })
        : Promise.resolve(null),
      subject
        ? prisma.pendingAction.findMany({
            where: { subjectType: subject.type, subjectId: subject.id, ...scope },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      awaitingAck,
      openCards,
      recent,
      failedJobs,
      ...(subject ? { subject: { assessments: subjectAssessments ?? [], cards: subjectCards ?? [] } } : {}),
    });
  },
  { roles: KNOX_ROLES },
);
