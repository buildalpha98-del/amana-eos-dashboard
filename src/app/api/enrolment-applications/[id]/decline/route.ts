import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendEnrolmentDeclinedNotification } from "@/lib/notifications/enrolment";
import { logger } from "@/lib/logger";

const declineSchema = z.object({
  reason: z.string().optional(),
});

// ── POST /api/enrolment-applications/[id]/decline ──

export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("Missing application ID");

    const body = await parseJsonBody(req);
    const data = declineSchema.parse(body);

    const application = await prisma.enrolmentApplication.findUnique({
      where: { id },
    });

    if (!application) {
      throw ApiError.notFound("Application not found");
    }

    if (application.status !== "pending") {
      throw ApiError.badRequest(
        `Application is already ${application.status}`,
      );
    }

    const updated = await prisma.enrolmentApplication.update({
      where: { id },
      data: {
        status: "declined",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        declineReason: data.reason ?? null,
      },
      include: {
        service: { select: { name: true } },
      },
    });

    // Fire and forget notification
    sendEnrolmentDeclinedNotification(id, data.reason).catch((err) => {
      logger.error("Failed to send decline notification", { applicationId: id, err });
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewedAt?.toISOString(),
      declineReason: updated.declineReason,
    });
  },
  { minRole: "coordinator" },
);
