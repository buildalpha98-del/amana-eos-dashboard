import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const rejectSchema = z.object({
  reason: z.string().optional(),
});

// POST /api/marketing/posts/:id/reject — reject a post in review
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const body = await parseJsonBody(req);
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const post = await prisma.marketingPost.findUnique({ where: { id } });
  if (!post || post.deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "in_review") {
    return NextResponse.json(
      { error: "Post must be in review to reject" },
      { status: 400 }
    );
  }

  const updated = await prisma.marketingPost.update({
    where: { id },
    data: {
      status: "draft",
      rejectionReason: parsed.data.reason || null,
      approvedById: null,
      approvedAt: null,
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      campaign: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "reject",
      entityType: "MarketingPost",
      entityId: id,
      details: { title: post.title, reason: parsed.data.reason },
    },
  });

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin", "marketing"] });
