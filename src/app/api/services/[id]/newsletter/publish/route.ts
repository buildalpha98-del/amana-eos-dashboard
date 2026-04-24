import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { z } from "zod";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);
const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

const publishSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }
    if (!ADMIN_ROLES.has(session.user.role) && session.user.role !== "coordinator") {
      throw ApiError.forbidden(
        "Only coordinators and admins can publish newsletters",
      );
    }

    const body = await parseJsonBody(req);
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const post = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!service) throw ApiError.notFound("Service not found");

      const created = await tx.parentPost.create({
        data: {
          serviceId: id,
          title: parsed.data.title,
          content: parsed.data.content,
          type: "newsletter",
          isCommunity: true,
          authorId: session.user.id,
          mediaUrls: [],
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "published_newsletter",
          entityType: "ParentPost",
          entityId: created.id,
          details: {
            serviceId: id,
            weekStart: parsed.data.weekStart,
          },
        },
      });

      return created;
    });

    return NextResponse.json(post, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
