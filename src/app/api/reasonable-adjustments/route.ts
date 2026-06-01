/**
 * GET  /api/reasonable-adjustments?userId=X — list adjustments for a user
 * POST /api/reasonable-adjustments              — create a new record
 *
 * Admin / owner / head_office only. Records often contain medical /
 * disability information; the API does not surface them to the
 * subject themselves through this endpoint.
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

const createSchema = z.object({
  userId: z.string().min(1),
  requestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestSummary: z.string().min(1).max(20_000),
  contextNotes: z.string().max(20_000).nullable().optional(),
  status: z.enum(STATUSES).optional(),
});

function toDate(s: string | null | undefined): Date | null | undefined {
  if (s === null) return null;
  if (s === undefined) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    const records = await prisma.reasonableAdjustment.findMany({
      where: { userId, deleted: false },
      include: { recordedBy: { select: { id: true, name: true } } },
      orderBy: { requestedAt: "desc" },
    });
    return NextResponse.json({ records });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = parsed.data;

    const subject = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true },
    });
    if (!subject) throw ApiError.notFound("User not found");

    const created = await prisma.reasonableAdjustment.create({
      data: {
        userId: data.userId,
        requestedAt: toDate(data.requestedAt)!,
        requestSummary: data.requestSummary.trim(),
        contextNotes: data.contextNotes ?? null,
        status: data.status ?? "under_assessment",
        recordedById: session!.user.id,
      },
      include: { recordedBy: { select: { id: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "reasonable_adjustment_created",
        entityType: "ReasonableAdjustment",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: subject.name,
        },
      },
    });

    logger.info("Reasonable adjustment recorded", {
      adjustmentId: created.id,
      subjectUserId: data.userId,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
