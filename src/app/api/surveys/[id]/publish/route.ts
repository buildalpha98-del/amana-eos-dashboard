/**
 * POST /api/surveys/[id]/publish — draft → published
 * POST /api/surveys/[id]/close   — published → closed (handled in
 *                                  /close/route.ts sibling)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const existing = await prisma.survey.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Survey not found");
    }
    if (existing.status !== "draft") {
      throw ApiError.badRequest(
        `Cannot publish — survey is already ${existing.status}.`,
      );
    }
    if (existing._count.questions === 0) {
      throw ApiError.badRequest(
        "Cannot publish a survey with no questions. Add at least one question first.",
      );
    }
    const updated = await prisma.survey.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "publish",
        entityType: "Survey",
        entityId: id,
        details: { title: existing.title },
      },
    });
    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
