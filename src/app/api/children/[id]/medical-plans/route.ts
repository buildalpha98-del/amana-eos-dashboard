/**
 * GET/POST /api/children/[id]/medical-plans
 *
 * Regulation 90 — the three plans a child with a medical condition must
 * have, and the thing the dashboard could not previously hold.
 *
 * Before this, a child's anaphylaxis was `medicalConditions: ["Anaphylaxis"]`
 * plus `anaphylaxisActionPlan: true` — a string in an array and a boolean.
 * That records that a plan EXISTS somewhere; it is not the plan. Reg
 * 90(1)(c) asks for three distinct things and assessors ask for all three
 * by name: the practitioner's medical management plan, a risk
 * minimisation plan developed IN CONSULTATION with the family, and a
 * communication plan.
 *
 * One row per CONDITION, not per child. A child with asthma and a nut
 * allergy has two management plans from two practitioners and two very
 * different emergency responses; collapsing them into one row is how a
 * service ends up giving Ventolin to an anaphylaxis.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";

const CONDITION_TYPES = [
  "anaphylaxis",
  "asthma",
  "diabetes",
  "epilepsy",
  "allergy",
  "dietary",
  "other",
] as const;

const createSchema = z.object({
  conditionType: z.enum(CONDITION_TYPES),
  /** As it should read on the medical wall — "Anaphylaxis — peanut". */
  condition: z.string().trim().min(1).max(200),
  severity: z.enum(["mild", "moderate", "severe"]).default("moderate"),
  managementPlanUrl: z.string().trim().url().optional().or(z.literal("")),
  managementPlanFileName: z.string().trim().max(200).optional(),
  practitionerName: z.string().trim().max(120).optional(),
  planIssuedDate: z.string().optional(),
  planExpiryDate: z.string().optional(),
  riskMinimisationPlan: z.string().trim().min(1).max(10000),
  communicationPlan: z.string().trim().min(1).max(10000),
  developedWithParentAt: z.string().optional(),
  emergencyResponse: z.string().trim().max(10000).optional(),
  medicationRequired: z.boolean().optional(),
  medicationDetails: z.string().trim().max(5000).optional(),
  medicationLocation: z.string().trim().max(200).optional(),
  reviewDueAt: z.string().optional(),
});

/** The child has to be in the caller's centre scope. */
async function loadScopedChild(
  childId: string,
  session: Parameters<typeof getCentreScope>[0],
) {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, serviceId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");

  const { serviceIds } = await getCentreScope(session);
  if (
    serviceIds !== null &&
    (!child.serviceId || !serviceIds.includes(child.serviceId))
  ) {
    throw ApiError.notFound("Child not found");
  }
  return child;
}

const dateOrNull = (v: string | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  await loadScopedChild(id, session);

  const includeArchived =
    new URL(req.url).searchParams.get("includeArchived") === "1";

  const plans = await prisma.childMedicalPlan.findMany({
    where: { childId: id, ...(includeArchived ? {} : { status: "active" }) },
    include: {
      createdBy: { select: { id: true, name: true } },
      lastReviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ plans });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const child = await loadScopedChild(id, session);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid plan", parsed.error.flatten());
    }
    const d = parsed.data;

    const plan = await prisma.childMedicalPlan.create({
      data: {
        childId: id,
        // Denormalised from the child so the register can be listed per
        // service without joining through Child on every read.
        serviceId: child.serviceId,
        conditionType: d.conditionType,
        condition: d.condition,
        severity: d.severity,
        managementPlanUrl: d.managementPlanUrl || null,
        managementPlanFileName: d.managementPlanFileName || null,
        practitionerName: d.practitionerName || null,
        planIssuedDate: dateOrNull(d.planIssuedDate),
        planExpiryDate: dateOrNull(d.planExpiryDate),
        riskMinimisationPlan: d.riskMinimisationPlan,
        communicationPlan: d.communicationPlan,
        // Reg 90(1)(c)(ii) requires consultation with the family. Left
        // null unless the caller says it happened — an absent timestamp
        // is a finding, and defaulting it would fabricate the evidence.
        developedWithParentAt: dateOrNull(d.developedWithParentAt),
        emergencyResponse: d.emergencyResponse || null,
        medicationRequired: Boolean(d.medicationRequired),
        medicationDetails: d.medicationDetails || null,
        medicationLocation: d.medicationLocation || null,
        reviewDueAt: dateOrNull(d.reviewDueAt),
        createdById: session!.user.id,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create_medical_plan",
        entityType: "ChildMedicalPlan",
        entityId: plan.id,
        details: { condition: d.condition, severity: d.severity },
      },
    });

    return NextResponse.json({ plan }, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
