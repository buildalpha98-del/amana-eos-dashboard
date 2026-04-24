import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

type RouteCtx = { params: Promise<{ id: string; raId: string }> };

// POST /api/services/[id]/risk-assessments/[raId]/approve
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id, raId } = await (context as unknown as RouteCtx).params;

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const ra = await prisma.riskAssessment.findUnique({
      where: { id: raId },
      select: { id: true, serviceId: true, authorId: true, approvedAt: true },
    });
    if (!ra || ra.serviceId !== id) {
      throw ApiError.notFound("Risk assessment not found");
    }
    if (ra.approvedAt) {
      throw ApiError.badRequest("Risk assessment is already approved");
    }
    if (ra.authorId === session.user.id) {
      throw ApiError.badRequest(
        "Risk assessments must be approved by a different user",
      );
    }

    const approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.riskAssessment.update({
        where: { id: raId },
        data: {
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          approvedBy: { select: { id: true, name: true, avatar: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "approved_risk_assessment",
          entityType: "RiskAssessment",
          entityId: raId,
          details: {
            serviceId: id,
            activityType: updated.activityType,
            date: updated.date.toISOString(),
          },
        },
      });

      return updated;
    });

    return NextResponse.json(approved);
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
