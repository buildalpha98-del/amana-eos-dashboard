import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { KNOX_ROLES, assertInScope } from "../../../_lib";

/**
 * POST /api/knox/assessments/[id]/ack
 *
 * Acknowledges the RECORD, not just this assessment: every outstanding alert
 * row across ALL assessments of the assessment's subject is stamped (not just
 * the caller's own rows — null-recipient marker rows must be acknowledgeable
 * by anyone with the centre in scope). A re-triage writes a new assessment
 * while the alert people were pinged about sits on an older one, so
 * acknowledging from the latest assessment (or from an old alert's deep link)
 * must stop every ladder for that record.
 *
 * Repeats are idempotent: they return the newest existing acknowledgement on
 * the record, which is the one the first call made.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    const assessment = await prisma.triageAssessment.findUnique({
      where: { id },
      select: { id: true, serviceId: true, tier: true, subjectType: true, subjectId: true },
    });
    if (!assessment) throw ApiError.notFound();
    const { serviceIds } = await getCentreScope(session);
    assertInScope(serviceIds, assessment.serviceId);

    const subjectAlerts = {
      assessment: { subjectType: assessment.subjectType, subjectId: assessment.subjectId },
    };
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claim = await tx.triageAlert.updateMany({
        where: { ...subjectAlerts, acknowledgedAt: null },
        data: { acknowledgedAt: now, acknowledgedById: session.user.id },
      });
      // Only an acknowledgement that stamped something is an event worth logging.
      if (claim.count > 0) {
        await tx.activityLog.create({
          data: {
            userId: session.user.id,
            action: "knox.acknowledged",
            entityType: "TriageAssessment",
            entityId: id,
            details: {
              tier: assessment.tier,
              subjectType: assessment.subjectType,
              subjectId: assessment.subjectId,
              alertsAcknowledged: claim.count,
            },
          },
        });
      }
    });

    const latest = await prisma.triageAlert.findFirst({
      where: { ...subjectAlerts, acknowledgedAt: { not: null } },
      orderBy: { acknowledgedAt: "desc" },
      select: { acknowledgedAt: true },
    });
    if (!latest?.acknowledgedAt) {
      throw ApiError.conflict("This record has no alerts to acknowledge");
    }
    return NextResponse.json({ acknowledgedAt: latest.acknowledgedAt });
  },
  { roles: KNOX_ROLES },
);
