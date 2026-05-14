import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const STATUS_VALUES = ["new", "reviewing", "actioned", "dismissed"] as const;

const updateSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  notes: z.string().max(4000).optional().nullable(),
  actionTaken: z.string().max(4000).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional().nullable(),
});

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/feedback/[id] — triage a parent feedback entry.
 *
 * When `status` moves out of "new" we stamp `reviewedAt` + `reviewedById`
 * so the queue can show "actioned by Jamal · 2h ago" without a separate
 * activity log. Setting status back to "new" clears those fields.
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!id) throw ApiError.badRequest("Missing feedback id");

  const parsed = updateSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }

  const existing = await prisma.parentFeedback.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound("Feedback not found");

  const statusChanged =
    parsed.data.status !== undefined && parsed.data.status !== existing.status;

  const updated = await prisma.parentFeedback.update({
    where: { id },
    data: {
      ...parsed.data,
      ...(statusChanged && parsed.data.status !== "new"
        ? { reviewedAt: new Date(), reviewedById: session.user.id }
        : {}),
      ...(statusChanged && parsed.data.status === "new"
        ? { reviewedAt: null, reviewedById: null }
        : {}),
    },
  });

  return NextResponse.json({ item: updated });
});
