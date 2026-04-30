import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

/**
 * GET /api/services/[id]/ai-context/reflection
 *
 * Aggregates the last 7 days of context for the
 * `nqs/reflection-draft` AI template:
 *   - weekSummary    : 1-line attendance + roster signal
 *   - recentObservations : up to 8 short observation excerpts
 *   - recentIncidents    : up to 5 incident facts (anonymised — no surnames)
 *   - recentAudits       : up to 3 completed audits with score + gap
 *
 * The hook calls this when the "New reflection" dialog opens so the
 * AiButton has real source material instead of placeholder strings.
 *
 * All values are short pre-formatted strings ready to drop into the
 * template — no further client-side formatting needed.
 */
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;

  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== id
  ) {
    throw ApiError.forbidden("You do not have access to this service");
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Fire queries in parallel — they're cheap and independent.
  const [service, observations, incidents, audits, attendance] = await Promise.all([
    prisma.service.findUnique({
      where: { id },
      select: { name: true },
    }),
    prisma.learningObservation.findMany({
      where: { serviceId: id, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        title: true,
        narrative: true,
        mtopOutcomes: true,
        child: { select: { firstName: true } },
      },
    }),
    prisma.incidentRecord.findMany({
      where: {
        serviceId: id,
        deleted: false,
        incidentDate: { gte: sevenDaysAgo },
      },
      orderBy: { incidentDate: "desc" },
      take: 5,
      select: {
        incidentType: true,
        severity: true,
        location: true,
        description: true,
        incidentDate: true,
      },
    }),
    prisma.auditInstance.findMany({
      where: {
        serviceId: id,
        status: "completed",
        completedAt: { gte: sevenDaysAgo },
      },
      orderBy: { completedAt: "desc" },
      take: 3,
      select: {
        complianceScore: true,
        areasForImprovement: true,
        completedAt: true,
        template: { select: { name: true, qualityArea: true } },
      },
    }),
    prisma.dailyAttendance.findMany({
      where: { serviceId: id, date: { gte: sevenDaysAgo } },
      select: { date: true, enrolled: true, attended: true, sessionType: true },
    }),
  ]);

  // ── Format ────────────────────────────────────────────────
  // Each block is a short, scannable summary. AI templates do better with
  // pre-digested signal than with raw rows.

  const recentObservations =
    observations.length > 0
      ? observations
          .map((o) => {
            const tags =
              o.mtopOutcomes.length > 0 ? ` (${o.mtopOutcomes.join(", ")})` : "";
            const snippet = o.narrative.length > 140
              ? `${o.narrative.slice(0, 140)}…`
              : o.narrative;
            return `- ${o.child.firstName}: ${o.title}${tags} — ${snippet}`;
          })
          .join("\n")
      : "(no observations recorded in the last 7 days)";

  const recentIncidents =
    incidents.length > 0
      ? incidents
          .map((i) => {
            const date = i.incidentDate.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            });
            const where = i.location ? ` at ${i.location}` : "";
            const snippet = i.description.length > 120
              ? `${i.description.slice(0, 120)}…`
              : i.description;
            return `- ${date}: ${i.incidentType} (${i.severity})${where} — ${snippet}`;
          })
          .join("\n")
      : "(no incidents in the last 7 days)";

  const recentAudits =
    audits.length > 0
      ? audits
          .map((a) => {
            const score = a.complianceScore != null
              ? `${a.complianceScore.toFixed(0)}%`
              : "n/a";
            const gap = a.areasForImprovement
              ? ` — gap: ${a.areasForImprovement.slice(0, 100)}${a.areasForImprovement.length > 100 ? "…" : ""}`
              : "";
            return `- QA${a.template.qualityArea} ${a.template.name}: ${score}${gap}`;
          })
          .join("\n")
      : "(no audits completed in the last 7 days)";

  // Attendance signal — 1 line summary
  const totalAttended = attendance.reduce(
    (sum, a) => sum + (a.attended ?? 0),
    0,
  );
  const totalEnrolled = attendance.reduce(
    (sum, a) => sum + (a.enrolled ?? 0),
    0,
  );
  const dayCount = new Set(attendance.map((a) => a.date.toISOString().slice(0, 10))).size;
  const weekSummary =
    dayCount > 0
      ? `${dayCount} session day(s) in the last 7 days, ${totalAttended} child-attendances vs ${totalEnrolled} enrolled.`
      : "(no attendance data in the last 7 days)";

  return NextResponse.json({
    serviceName: service?.name ?? "this service",
    weekSummary,
    recentObservations,
    recentIncidents,
    recentAudits,
  });
});
