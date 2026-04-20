import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createCommentSchema = z.object({
  text: z.string().min(1, "Comment text is required"),
});

// GET /api/marketing/campaigns/:id/comments — list comments for a campaign
export const GET = withApiAuth(async (req, session, context) => {
  const { id: campaignId } = await context!.params!;

  const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.deleted) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const comments = await prisma.marketingComment.findMany({
    where: { campaignId },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(comments);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// POST /api/marketing/campaigns/:id/comments — add a comment to a campaign
export const POST = withApiAuth(async (req, session, context) => {
const { id: campaignId } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = createCommentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.deleted) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const comment = await prisma.marketingComment.create({
    data: {
      text: parsed.data.text,
      campaignId,
      authorId: session!.user.id,
    },
    include: {
      author: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "MarketingComment",
      entityId: comment.id,
      details: { campaignId, text: parsed.data.text },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
