/**
 * PATCH /api/workers-comp-claims/[id] — update status / RTW / fields
 * GET   /api/workers-comp-claims/[id] — fetch one claim
 *
 * Closing a claim (status → closed) auto-stamps closedAt + closedById
 * so closure attribution is always recorded.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const STATUSES = [
  "lodged",
  "under_review",
  "accepted",
  "declined",
  "on_hold",
  "closed",
  "reopened",
] as const;

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  claimNumber: z.string().max(100).nullable().optional(),
  insurerName: z.string().max(200).nullable().optional(),
  insurerContact: z.string().max(2000).nullable().optional(),
  dateOfDecision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  injuryDescription: z.string().max(20_000).nullable().optional(),
  bodyPart: z.string().max(200).nullable().optional(),
  mechanismOfInjury: z.string().max(20_000).nullable().optional(),
  rtwPlanCreated: z.boolean().optional(),
  rtwPlanUrl: z.string().url().nullable().optional(),
  rtwStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rtwFullCapacityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currentRestrictions: z.string().max(20_000).nullable().optional(),
  weeklyPaymentActive: z.boolean().optional(),
  weeklyPaymentRate: z.number().min(0).nullable().optional(),
  medicalExpensesPaid: z.number().min(0).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function toDate(s: string | null | undefined): Date | null | undefined {
  if (s === null) return null;
  if (s === undefined) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const claim = await prisma.workersCompensationClaim.findUnique({
      where: { id },
      include: {
        incident: { select: { id: true, incidentDate: true, description: true, incidentType: true } },
        createdBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
    if (!claim || claim.deleted) throw ApiError.notFound("Claim not found");
    return NextResponse.json(claim);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.workersCompensationClaim.findUnique({
      where: { id },
    });
    if (!existing || existing.deleted) throw ApiError.notFound("Claim not found");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const p = parsed.data;

    const update: Record<string, unknown> = {};
    if (p.status !== undefined) {
      update.status = p.status;
      // Auto-stamp closure on status=closed; auto-clear if reopening.
      const wasClosed = existing.status === "closed";
      const isClosed = p.status === "closed";
      if (isClosed && !wasClosed) {
        update.closedAt = new Date();
        update.closedById = session!.user.id;
      } else if (!isClosed && wasClosed) {
        update.closedAt = null;
        update.closedById = null;
      }
    }
    if (p.claimNumber !== undefined) update.claimNumber = p.claimNumber;
    if (p.insurerName !== undefined) update.insurerName = p.insurerName;
    if (p.insurerContact !== undefined) update.insurerContact = p.insurerContact;
    if (p.dateOfDecision !== undefined)
      update.dateOfDecision = toDate(p.dateOfDecision);
    if (p.injuryDescription !== undefined)
      update.injuryDescription = p.injuryDescription;
    if (p.bodyPart !== undefined) update.bodyPart = p.bodyPart;
    if (p.mechanismOfInjury !== undefined)
      update.mechanismOfInjury = p.mechanismOfInjury;
    if (p.rtwPlanCreated !== undefined) update.rtwPlanCreated = p.rtwPlanCreated;
    if (p.rtwPlanUrl !== undefined) update.rtwPlanUrl = p.rtwPlanUrl;
    if (p.rtwStartDate !== undefined) update.rtwStartDate = toDate(p.rtwStartDate);
    if (p.rtwFullCapacityDate !== undefined)
      update.rtwFullCapacityDate = toDate(p.rtwFullCapacityDate);
    if (p.currentRestrictions !== undefined)
      update.currentRestrictions = p.currentRestrictions;
    if (p.weeklyPaymentActive !== undefined)
      update.weeklyPaymentActive = p.weeklyPaymentActive;
    if (p.weeklyPaymentRate !== undefined)
      update.weeklyPaymentRate = p.weeklyPaymentRate;
    if (p.medicalExpensesPaid !== undefined)
      update.medicalExpensesPaid = p.medicalExpensesPaid;
    if (p.notes !== undefined) update.notes = p.notes;

    const updated = await prisma.workersCompensationClaim.update({
      where: { id },
      data: update,
      include: {
        incident: { select: { id: true, incidentDate: true, description: true, incidentType: true } },
        createdBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "workers_comp_claim_updated",
        entityType: "WorkersCompensationClaim",
        entityId: id,
        details: JSON.parse(
          JSON.stringify({
            changes: update,
            previousStatus: existing.status,
          }),
        ),
      },
    });

    logger.info("Workers comp claim updated", {
      claimId: id,
      actorId: session!.user.id,
      changedKeys: Object.keys(update),
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
