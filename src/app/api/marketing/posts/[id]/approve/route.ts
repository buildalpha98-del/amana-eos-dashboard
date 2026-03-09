import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// POST /api/marketing/posts/:id/approve — approve a post in review
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const post = await prisma.marketingPost.findUnique({ where: { id } });
  if (!post || post.deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "in_review") {
    return NextResponse.json(
      { error: "Post must be in review to approve" },
      { status: 400 }
    );
  }

  const updated = await prisma.marketingPost.update({
    where: { id },
    data: {
      status: "approved",
      approvedById: session!.user.id,
      approvedAt: new Date(),
      rejectionReason: null,
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      campaign: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "approve",
      entityType: "MarketingPost",
      entityId: id,
      details: { title: post.title },
    },
  });

  return NextResponse.json(updated);
}
