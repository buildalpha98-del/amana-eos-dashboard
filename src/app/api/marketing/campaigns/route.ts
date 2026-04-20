import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z
    .enum(["campaign", "event", "launch", "promotion", "awareness", "partnership", "activation"])
    .default("campaign"),
  status: z
    .enum(["draft", "scheduled", "active", "completed", "paused", "cancelled"])
    .default("draft"),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  platforms: z
    .array(
      z.enum(["facebook", "instagram", "linkedin", "email", "newsletter", "website", "flyer"])
    )
    .optional(),
  goal: z.string().optional(),
  notes: z.string().optional(),
  designLink: z.string().optional(),
  budget: z.number().optional(),
  location: z.string().optional(),
  deliverables: z.string().optional(),
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

// GET /api/marketing/campaigns — list campaigns with optional filters
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const serviceId = searchParams.get("serviceId");

  const campaigns = await prisma.marketingCampaign.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(type ? { type: type as any } : {}),
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    include: {
      _count: {
        select: {
          posts: { where: { deleted: false } },
          comments: true,
        },
      },
      ...serviceInclude,
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(campaigns);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// POST /api/marketing/campaigns — create a new campaign
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { serviceIds, ...campaignData } = parsed.data;

  const campaign = await prisma.marketingCampaign.create({
    data: {
      name: campaignData.name,
      type: campaignData.type,
      status: campaignData.status,
      startDate: campaignData.startDate || null,
      endDate: campaignData.endDate || null,
      platforms: campaignData.platforms || [],
      goal: campaignData.goal || null,
      notes: campaignData.notes || null,
      designLink: campaignData.designLink || null,
      budget: campaignData.budget ?? null,
      location: campaignData.location || null,
      deliverables: campaignData.deliverables || null,
    },
  });

  // Link services if provided
  if (serviceIds && serviceIds.length > 0) {
    await prisma.marketingCampaignService.createMany({
      data: serviceIds.map((serviceId) => ({
        campaignId: campaign.id,
        serviceId,
      })),
    });
  }

  // Re-fetch with all includes
  const fullCampaign = await prisma.marketingCampaign.findUnique({
    where: { id: campaign.id },
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
      action: "create",
      entityType: "MarketingCampaign",
      entityId: campaign.id,
      details: { name: campaign.name, type: campaign.type },
    },
  });

  return NextResponse.json(fullCampaign, { status: 201 });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
