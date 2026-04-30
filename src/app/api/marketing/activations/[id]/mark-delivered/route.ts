import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { planTransition } from "@/lib/activation-lifecycle";

/**
 * Sprint 6 stub — kept for backward compatibility. Sprint 7 introduced the
 * full /transition endpoint with stage validation; clients should migrate.
 *
 * For "undo": clears delivered timestamp and resets lifecycleStage to its
 * prior value (best effort — back to the most-recent set timestamp's stage,
 * or 'concept' if none).
 */
const bodySchema = z.object({
  deliveredAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid deliveredAt" }).optional(),
  actualAttendance: z.number().int().min(0).optional(),
  undo: z.boolean().optional(),
});

export const POST = withApiAuth(
  async (req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("activation id required");

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const existing = await prisma.campaignActivationAssignment.findUnique({
      where: { id },
      select: {
        id: true,
        lifecycleStage: true,
        finalPushStartedAt: true,
        logisticsStartedAt: true,
        conceptApprovedAt: true,
      },
    });
    if (!existing) throw ApiError.notFound("Activation not found");

    if (parsed.data.undo) {
      // Reset to the most-recent prior stage we have a timestamp for.
      const priorStage = existing.finalPushStartedAt
        ? "final_push"
        : existing.logisticsStartedAt
          ? "logistics"
          : existing.conceptApprovedAt
            ? "approved"
            : "concept";
      const updated = await prisma.campaignActivationAssignment.update({
        where: { id },
        data: { activationDeliveredAt: null, recapPublishedAt: null, lifecycleStage: priorStage },
        select: { id: true, lifecycleStage: true, activationDeliveredAt: true },
      });
      return NextResponse.json({
        id: updated.id,
        status: updated.lifecycleStage, // back-compat field name
        activationDeliveredAt: null,
      });
    }

    // Default attendance to 0 if caller didn't supply one — preserves
    // Sprint 6's "click and go" behaviour. UI on the new page should use
    // /transition with a real value.
    const result = planTransition(existing.lifecycleStage, "delivered", {
      occurredAt: parsed.data.deliveredAt ? new Date(parsed.data.deliveredAt) : undefined,
      actualAttendance: parsed.data.actualAttendance ?? 0,
    });
    if (!result.ok) throw ApiError.badRequest(result.error);

    const updated = await prisma.campaignActivationAssignment.update({
      where: { id },
      data: result.patch,
      select: { id: true, lifecycleStage: true, activationDeliveredAt: true },
    });
    return NextResponse.json({
      id: updated.id,
      status: updated.lifecycleStage,
      activationDeliveredAt: updated.activationDeliveredAt?.toISOString() ?? null,
    });
  },
  { roles: ["marketing", "owner"] },
);
