/**
 * POST /api/surveys/[id]/close — published → closed
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Survey not found");
    }
    if (existing.status !== "published") {
      throw ApiError.badRequest(
        `Cannot close — survey is ${existing.status}. Only published surveys can be closed.`,
      );
    }
    const updated = await prisma.survey.update({
      where: { id },
      data: { status: "closed" },
    });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "close",
        entityType: "Survey",
        entityId: id,
        details: { title: existing.title },
      },
    });
    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
