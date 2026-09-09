import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { notifyPayDiscrepancyResolved } from "@/lib/pay-discrepancy/notify";

type RouteCtx = { params: Promise<{ id: string }> };

const reportInclude = {
  reporter: { select: { id: true, name: true, email: true, avatar: true } },
  reviewedBy: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
} as const;

/** PATCH /api/pay-discrepancies/[id] — admin-tier only: review/resolve/dismiss. */
const patchBodySchema = z.object({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  resolutionNotes: z.string().max(5000).optional(),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;
    const raw = await parseJsonBody(req);
    const parsed = patchBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
    }
    const body = parsed.data;

    const existing = await prisma.payDiscrepancyReport.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Report not found");

    const isTerminal = body.status === "resolved" || body.status === "dismissed";
    const updated = await prisma.payDiscrepancyReport.update({
      where: { id },
      data: {
        status: body.status,
        reviewedById: session.user.id,
        resolutionNotes: body.resolutionNotes ?? existing.resolutionNotes,
        resolvedAt: isTerminal ? new Date() : null,
      },
      include: reportInclude,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "update",
        entityType: "PayDiscrepancyReport",
        entityId: id,
        details: { status: body.status },
      },
    });

    if (body.status === "resolved" || body.status === "dismissed") {
      await notifyPayDiscrepancyResolved(
        prisma,
        { id: updated.id, reporterId: updated.reporterId, reporterName: updated.reporter.name },
        session.user.id,
        body.status,
      );
    }

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
