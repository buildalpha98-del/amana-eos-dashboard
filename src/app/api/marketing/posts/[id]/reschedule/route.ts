import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const rescheduleSchema = z.object({
  scheduledDate: z.coerce.date(),
});

// PATCH /api/marketing/posts/:id/reschedule — reschedule a post
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = rescheduleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingPost.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const post = await prisma.marketingPost.update({
    where: { id },
    data: { scheduledDate: parsed.data.scheduledDate },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      campaign: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "reschedule",
      entityType: "MarketingPost",
      entityId: id,
      details: { scheduledDate: parsed.data.scheduledDate.toISOString() },
    },
  });

  return NextResponse.json(post);
}, { roles: ["owner", "head_office", "admin", "marketing"] });
