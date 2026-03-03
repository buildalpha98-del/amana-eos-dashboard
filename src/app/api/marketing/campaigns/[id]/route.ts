import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  type: z
    .enum(["campaign", "event", "launch", "promotion", "awareness", "partnership"])
    .optional(),
  status: z
    .enum(["draft", "scheduled", "active", "completed", "paused", "cancelled"])
    .optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  platforms: z
    .array(
      z.enum(["facebook", "instagram", "linkedin", "email", "newsletter", "website", "flyer"])
    )
    .optional(),
  goal: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  designLink: z.string().optional().nullable(),
});

// GET /api/marketing/campaigns/:id — get a single campaign with all related data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const campaign = await prisma.marketingCampaign.findUnique({
    where: { id },
    include: {
      posts: {
        where: { deleted: false },
        include: {
          assignee: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { scheduledDate: "asc" },
      },
      comments: {
        include: {
          author: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: {
          posts: { where: { deleted: false } },
        },
      },
    },
  });

  if (!campaign || campaign.deleted) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

// PATCH /api/marketing/campaigns/:id — update a campaign
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const campaign = await prisma.marketingCampaign.update({
    where: { id },
    data: parsed.data,
    include: {
      _count: {
        select: {
          posts: { where: { deleted: false } },
          comments: true,
        },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingCampaign",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(campaign);
}

// DELETE /api/marketing/campaigns/:id — soft delete a campaign
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.marketingCampaign.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  await prisma.marketingCampaign.update({ where: { id }, data: { deleted: true } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingCampaign",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
