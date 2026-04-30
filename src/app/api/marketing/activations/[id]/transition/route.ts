import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ActivationLifecycleStage } from "@prisma/client";
import { planTransition } from "@/lib/activation-lifecycle";

const bodySchema = z.object({
  toStage: z.nativeEnum(ActivationLifecycleStage),
  occurredAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid occurredAt" }).optional(),
  notes: z.string().max(2000).optional(),
  actualAttendance: z.number().int().min(0).optional(),
  enquiriesGenerated: z.number().int().min(0).optional(),
  recapPostId: z.string().nullable().optional(),
  cancellationReason: z.string().max(2000).optional(),
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
      select: { id: true, lifecycleStage: true, notes: true },
    });
    if (!existing) throw ApiError.notFound("Activation not found");

    if (parsed.data.recapPostId) {
      const post = await prisma.marketingPost.findUnique({
        where: { id: parsed.data.recapPostId },
        select: { id: true },
      });
      if (!post) throw ApiError.badRequest("recapPostId does not exist");
    }

    const result = planTransition(existing.lifecycleStage, parsed.data.toStage, {
      occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined,
      actualAttendance: parsed.data.actualAttendance,
      enquiriesGenerated: parsed.data.enquiriesGenerated,
      recapPostId: parsed.data.recapPostId ?? undefined,
      cancellationReason: parsed.data.cancellationReason,
    });
    if (!result.ok) throw ApiError.badRequest(result.error);

    const data: Record<string, unknown> = { ...result.patch };
    // Append notes to the existing notes field with a timestamped line, if provided.
    if (parsed.data.notes && parsed.data.notes.trim()) {
      const stamp = (parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date()).toISOString().slice(0, 10);
      const append = `[${stamp} → ${parsed.data.toStage}] ${parsed.data.notes.trim()}`;
      data.notes = existing.notes ? `${existing.notes}\n${append}` : append;
    }

    // If transitioning to recap_published, link the MarketingPost as a recap.
    if (parsed.data.toStage === "recap_published" && parsed.data.recapPostId) {
      await prisma.marketingPost.update({
        where: { id: parsed.data.recapPostId },
        data: { recapForActivationId: id },
      });
    }

    const updated = await prisma.campaignActivationAssignment.update({
      where: { id },
      data,
      select: {
        id: true,
        lifecycleStage: true,
        conceptApprovedAt: true,
        logisticsStartedAt: true,
        finalPushStartedAt: true,
        activationDeliveredAt: true,
        recapPublishedAt: true,
        cancelledAt: true,
        actualAttendance: true,
        enquiriesGenerated: true,
        cancellationReason: true,
      },
    });
    return NextResponse.json({
      id: updated.id,
      lifecycleStage: updated.lifecycleStage,
      timestamps: {
        conceptApprovedAt: updated.conceptApprovedAt?.toISOString() ?? null,
        logisticsStartedAt: updated.logisticsStartedAt?.toISOString() ?? null,
        finalPushStartedAt: updated.finalPushStartedAt?.toISOString() ?? null,
        activationDeliveredAt: updated.activationDeliveredAt?.toISOString() ?? null,
        recapPublishedAt: updated.recapPublishedAt?.toISOString() ?? null,
        cancelledAt: updated.cancelledAt?.toISOString() ?? null,
      },
      actualAttendance: updated.actualAttendance,
      enquiriesGenerated: updated.enquiriesGenerated,
      cancellationReason: updated.cancellationReason,
    });
  },
  { roles: ["marketing", "owner"] },
);
