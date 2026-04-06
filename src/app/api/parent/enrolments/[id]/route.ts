import { NextRequest, NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

// ── DELETE /api/parent/enrolments/[id] — withdraw a pending application ──

export const DELETE = withParentAuth(
  async (req: NextRequest, ctx) => {
    const params = await ctx.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("Missing application ID");

    // Find the application
    const application = await prisma.enrolmentApplication.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        family: { select: { email: true } },
      },
    });

    if (!application) {
      throw ApiError.notFound("Application not found");
    }

    // Verify ownership
    if (
      application.family.email.toLowerCase().trim() !==
      ctx.parent.email.toLowerCase().trim()
    ) {
      throw ApiError.forbidden("This application does not belong to you");
    }

    // Only pending applications can be withdrawn
    if (application.status !== "pending") {
      throw ApiError.badRequest(
        "Only pending applications can be withdrawn",
      );
    }

    const updated = await prisma.enrolmentApplication.update({
      where: { id },
      data: { status: "withdrawn" },
      include: {
        service: { select: { name: true } },
      },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      childFirstName: updated.childFirstName,
      childLastName: updated.childLastName,
      serviceName: updated.service.name,
    });
  },
);
