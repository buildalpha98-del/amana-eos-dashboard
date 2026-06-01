/**
 * PATCH /api/reasonable-adjustments/[id] — update an adjustment record
 *
 * Declines REQUIRE `declineReasons` of at least 20 characters — the
 * DDA "unjustifiable hardship" defence is hard to maintain without
 * documented reasoning.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const STATUSES = [
  "under_assessment",
  "provided",
  "modified",
  "declined",
  "withdrawn",
  "no_longer_needed",
] as const;

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  requestSummary: z.string().min(1).max(20_000).optional(),
  contextNotes: z.string().max(20_000).nullable().optional(),
  assessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assessmentNotes: z.string().max(20_000).nullable().optional(),
  decisionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  decisionDetail: z.string().max(20_000).nullable().optional(),
  declineReasons: z.string().max(20_000).nullable().optional(),
  reviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fileUrl: z.string().url().nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function toDate(s: string | null | undefined): Date | null | undefined {
  if (s === null) return null;
  if (s === undefined) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.reasonableAdjustment.findUnique({
      where: { id },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Adjustment record not found");
    }

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const p = parsed.data;

    // If moving to declined, require declineReasons either in this
    // payload or already on the existing row.
    if (p.status === "declined") {
      const reasons = p.declineReasons ?? existing.declineReasons ?? "";
      if (reasons.trim().length < 20) {
        throw ApiError.badRequest(
          "Declined adjustments require declineReasons of at least 20 characters explaining the unjustifiable hardship basis.",
        );
      }
    }

    const update: Record<string, unknown> = {};
    if (p.status !== undefined) update.status = p.status;
    if (p.requestSummary !== undefined) update.requestSummary = p.requestSummary;
    if (p.contextNotes !== undefined) update.contextNotes = p.contextNotes;
    if (p.assessedAt !== undefined) update.assessedAt = toDate(p.assessedAt);
    if (p.assessmentNotes !== undefined)
      update.assessmentNotes = p.assessmentNotes;
    if (p.decisionAt !== undefined) update.decisionAt = toDate(p.decisionAt);
    if (p.decisionDetail !== undefined) update.decisionDetail = p.decisionDetail;
    if (p.declineReasons !== undefined) update.declineReasons = p.declineReasons;
    if (p.reviewAt !== undefined) update.reviewAt = toDate(p.reviewAt);
    if (p.fileUrl !== undefined) update.fileUrl = p.fileUrl;
    if (p.fileName !== undefined) update.fileName = p.fileName;

    // Auto-stamp decisionAt when status moves from under_assessment
    // to a terminal state and the caller didn't supply one.
    const terminal: typeof STATUSES[number][] = [
      "provided",
      "modified",
      "declined",
      "no_longer_needed",
    ];
    if (
      p.status !== undefined &&
      terminal.includes(p.status) &&
      existing.decisionAt === null &&
      p.decisionAt === undefined
    ) {
      update.decisionAt = new Date();
    }

    const updated = await prisma.reasonableAdjustment.update({
      where: { id },
      data: update,
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "reasonable_adjustment_updated",
        entityType: "ReasonableAdjustment",
        entityId: id,
        details: JSON.parse(
          JSON.stringify({
            changes: update,
            previousStatus: existing.status,
          }),
        ),
      },
    });

    logger.info("Reasonable adjustment updated", {
      adjustmentId: id,
      actorId: session!.user.id,
      changedKeys: Object.keys(update),
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
