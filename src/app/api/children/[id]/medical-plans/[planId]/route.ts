/**
 * PATCH/DELETE /api/children/[id]/medical-plans/[planId]
 *
 * Editing one Reg 90 plan: revising it, recording the annual review,
 * capturing the family's acknowledgement, and retiring it.
 *
 * DELETE archives rather than deletes. A plan that was in force at the
 * time of an incident has to stay readable afterwards — it is the
 * document that says what the service was supposed to do, and destroying
 * it removes the only evidence of whether they did.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";

const patchSchema = z.object({
  condition: z.string().trim().min(1).max(200).optional(),
  conditionType: z
    .enum(["anaphylaxis", "asthma", "diabetes", "epilepsy", "allergy", "dietary", "other"])
    .optional(),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  managementPlanUrl: z.string().trim().url().nullable().optional(),
  managementPlanFileName: z.string().trim().max(200).nullable().optional(),
  practitionerName: z.string().trim().max(120).nullable().optional(),
  planIssuedDate: z.string().nullable().optional(),
  planExpiryDate: z.string().nullable().optional(),
  riskMinimisationPlan: z.string().trim().min(1).max(10000).optional(),
  communicationPlan: z.string().trim().min(1).max(10000).optional(),
  developedWithParentAt: z.string().nullable().optional(),
  emergencyResponse: z.string().trim().max(10000).nullable().optional(),
  medicationRequired: z.boolean().optional(),
  medicationDetails: z.string().trim().max(5000).nullable().optional(),
  medicationLocation: z.string().trim().max(200).nullable().optional(),
  reviewDueAt: z.string().nullable().optional(),
  /**
   * Mark the plan reviewed. A boolean, not a timestamp — the server
   * stamps when and who, so a review can't be back-dated to look like
   * the annual obligation was met on time.
   */
  markReviewed: z.boolean().optional(),
  /** The family's confirmation that the plan is current and correct. */
  parentAcknowledgedName: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

async function loadScoped(
  childId: string,
  planId: string,
  session: Parameters<typeof getCentreScope>[0],
) {
  const plan = await prisma.childMedicalPlan.findUnique({
    where: { id: planId },
    select: { id: true, childId: true, serviceId: true },
  });
  // The plan must belong to the child in the path — a plan id from
  // another child could otherwise be edited through this URL.
  if (!plan || plan.childId !== childId) {
    throw ApiError.notFound("Plan not found");
  }

  const { serviceIds } = await getCentreScope(session);
  if (
    serviceIds !== null &&
    (!plan.serviceId || !serviceIds.includes(plan.serviceId))
  ) {
    throw ApiError.notFound("Plan not found");
  }
  return plan;
}

const dateOrNull = (v: string | null | undefined) => {
  if (v === undefined) return undefined;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, planId } = await context!.params!;
    await loadScoped(id, planId, session);

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid plan change", parsed.error.flatten());
    }
    const d = parsed.data;

    const updated = await prisma.childMedicalPlan.update({
      where: { id: planId },
      data: {
        ...(d.condition !== undefined ? { condition: d.condition } : {}),
        ...(d.conditionType !== undefined
          ? { conditionType: d.conditionType }
          : {}),
        ...(d.severity !== undefined ? { severity: d.severity } : {}),
        ...(d.managementPlanUrl !== undefined
          ? { managementPlanUrl: d.managementPlanUrl }
          : {}),
        ...(d.managementPlanFileName !== undefined
          ? { managementPlanFileName: d.managementPlanFileName }
          : {}),
        ...(d.practitionerName !== undefined
          ? { practitionerName: d.practitionerName }
          : {}),
        ...(d.planIssuedDate !== undefined
          ? { planIssuedDate: dateOrNull(d.planIssuedDate) }
          : {}),
        ...(d.planExpiryDate !== undefined
          ? { planExpiryDate: dateOrNull(d.planExpiryDate) }
          : {}),
        ...(d.riskMinimisationPlan !== undefined
          ? { riskMinimisationPlan: d.riskMinimisationPlan }
          : {}),
        ...(d.communicationPlan !== undefined
          ? { communicationPlan: d.communicationPlan }
          : {}),
        ...(d.developedWithParentAt !== undefined
          ? { developedWithParentAt: dateOrNull(d.developedWithParentAt) }
          : {}),
        ...(d.emergencyResponse !== undefined
          ? { emergencyResponse: d.emergencyResponse }
          : {}),
        ...(d.medicationRequired !== undefined
          ? { medicationRequired: d.medicationRequired }
          : {}),
        ...(d.medicationDetails !== undefined
          ? { medicationDetails: d.medicationDetails }
          : {}),
        ...(d.medicationLocation !== undefined
          ? { medicationLocation: d.medicationLocation }
          : {}),
        ...(d.reviewDueAt !== undefined
          ? { reviewDueAt: dateOrNull(d.reviewDueAt) }
          : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        // Server-stamped; see the note on markReviewed.
        ...(d.markReviewed
          ? { lastReviewedAt: new Date(), lastReviewedById: session!.user.id }
          : {}),
        ...(d.parentAcknowledgedName !== undefined
          ? {
              parentAcknowledgedName: d.parentAcknowledgedName,
              parentAcknowledgedAt: d.parentAcknowledgedName
                ? new Date()
                : null,
            }
          : {}),
      },
    });

    return NextResponse.json({ plan: updated });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id, planId } = await context!.params!;
    await loadScoped(id, planId, session);

    // Archive, never destroy. A plan in force at the time of an incident
    // is the document that says what the service was supposed to do.
    const archived = await prisma.childMedicalPlan.update({
      where: { id: planId },
      data: { status: "archived" },
      select: { id: true, status: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "archive_medical_plan",
        entityType: "ChildMedicalPlan",
        entityId: planId,
        details: {},
      },
    });

    return NextResponse.json({ plan: archived });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
