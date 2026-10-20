import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { KNOX_ROLES, assertInScope } from "../../../_lib";

/**
 * POST /api/knox/assessments/[id]/ack
 *
 * Acknowledges EVERY outstanding alert row of the assessment (not just the
 * caller's own): assessments whose only rows are null-recipient marker rows
 * must still be acknowledgeable by anyone with the centre in scope. Repeats
 * are idempotent and return the earliest existing acknowledgement.
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

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const claim = await tx.triageAlert.updateMany({
        where: { assessmentId: id, acknowledgedAt: null },
        data: { acknowledgedAt: now, acknowledgedById: session.user.id },
      });
      // Only the first acknowledgement is an event worth logging.
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
            },
          },
        });
      }
    });

    const earliest = await prisma.triageAlert.findFirst({
      where: { assessmentId: id, acknowledgedAt: { not: null } },
      orderBy: { acknowledgedAt: "asc" },
      select: { acknowledgedAt: true },
    });
    if (!earliest?.acknowledgedAt) {
      throw ApiError.conflict("This assessment has no alerts to acknowledge");
    }
    return NextResponse.json({ acknowledgedAt: earliest.acknowledgedAt });
  },
  { roles: KNOX_ROLES },
);
