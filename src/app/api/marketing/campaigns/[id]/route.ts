import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  type: z
    .enum(["campaign", "event", "launch", "promotion", "awareness", "partnership", "activation"])
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
  budget: z.number().optional().nullable(),
  location: z.string().optional().nullable(),
  deliverables: z.string().optional().nullable(),
  serviceIds: z.array(z.string()).optional(),
});

const serviceInclude = {
  services: {
    select: {
      service: {
        select: { id: true, name: true, code: true },
      },
    },
  },
} as const;

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
      ...serviceInclude,
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

  const { serviceIds, ...updateData } = parsed.data;

  // Track whether campaign is newly becoming active
  const wasNotActive = existing.status !== "active";

  const campaign = await prisma.marketingCampaign.update({
    where: { id },
    data: updateData,
  });

  // Auto-create starter tasks when campaign becomes active
  if (parsed.data.status === "active" && wasNotActive) {
    const starterTasks = [
      { title: "Review campaign brief & goals", daysOffset: 0 },
      { title: "Create content for campaign", daysOffset: 3 },
      { title: "Schedule posts across platforms", daysOffset: 5 },
      { title: "Monitor performance & engagement", daysOffset: 7 },
    ];
    const now = new Date();
    await Promise.all(
      starterTasks.map((t) => {
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + t.daysOffset);
        return prisma.marketingTask.create({
          data: {
            title: t.title,
            status: "todo",
            priority: "medium",
            campaignId: id,
            dueDate,
          },
        });
      })
    );
  }

  // Sync service join table if serviceIds provided
  if (serviceIds !== undefined) {
    await prisma.marketingCampaignService.deleteMany({ where: { campaignId: id } });
    if (serviceIds.length > 0) {
      await prisma.marketingCampaignService.createMany({
        data: serviceIds.map((serviceId) => ({
          campaignId: id,
          serviceId,
        })),
      });
    }
  }

  // Re-fetch with all includes
  const fullCampaign = await prisma.marketingCampaign.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          posts: { where: { deleted: false } },
          comments: true,
        },
      },
      ...serviceInclude,
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

  return NextResponse.json(fullCampaign);
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
