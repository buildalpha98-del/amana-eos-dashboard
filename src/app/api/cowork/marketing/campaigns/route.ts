import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum([
    "campaign", "event", "launch", "promotion",
    "awareness", "partnership", "activation",
  ]).default("campaign"),
  status: z.enum([
    "draft", "scheduled", "active", "completed", "paused", "cancelled",
  ]).default("draft"),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  platforms: z.array(z.enum([
    "facebook", "instagram", "linkedin", "tiktok",
    "email", "newsletter", "website", "flyer",
  ])).optional(),
  description: z.string().optional(),
  goal: z.string().optional(),
  notes: z.string().optional(),
  designLink: z.string().optional(),
  budget: z.number().optional(),
  location: z.string().optional(),
  deliverables: z.string().optional(),
  serviceIds: z.array(z.string()).optional(),
  serviceCodes: z.array(z.string()).optional(),
});

/**
 * POST /api/cowork/marketing/campaigns — Create a marketing campaign via API key
 * Auth: API key with "marketing-campaigns:write" scope
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const data = createCampaignSchema.parse(body);

    // Resolve service IDs from codes if provided
    let resolvedServiceIds = data.serviceIds || [];
    if (data.serviceCodes && data.serviceCodes.length > 0) {
      const services = await prisma.service.findMany({
        where: { code: { in: data.serviceCodes }, status: "active" },
        select: { id: true },
      });
      resolvedServiceIds = [...resolvedServiceIds, ...services.map((s) => s.id)];
    }

    const campaign = await prisma.marketingCampaign.create({
      data: {
        name: data.name,
        type: data.type as any,
        status: data.status as any,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        platforms: (data.platforms as any) || [],
        goal: data.goal || data.description || null,
        notes: data.notes || null,
        designLink: data.designLink || null,
        budget: data.budget || null,
        location: data.location || null,
        deliverables: data.deliverables || null,
      },
    });

    // Link services
    if (resolvedServiceIds.length > 0) {
      const uniqueIds = [...new Set(resolvedServiceIds)];
      await prisma.marketingCampaignService.createMany({
        data: uniqueIds.map((serviceId) => ({
          campaignId: campaign.id,
          serviceId,
        })),
        skipDuplicates: true,
      });
    }

    // Re-fetch with relations
    const result = await prisma.marketingCampaign.findUnique({
      where: { id: campaign.id },
      include: {
        services: { select: { service: { select: { id: true, name: true, code: true } } } },
        _count: { select: { posts: true, tasks: true } },
      },
    });

    logCoworkActivity({
      action: "api_import",
      entityType: "MarketingCampaign",
      entityId: campaign.id,
      details: { campaignName: campaign.name, via: "cowork_api", keyName: "Cowork Automation" },
    });

    return NextResponse.json({ success: true, campaign: result }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Marketing Campaigns", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/cowork/marketing/campaigns — List campaigns via API key
 * Auth: API key with "marketing-campaigns:read" scope
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const serviceCode = searchParams.get("serviceCode");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  let serviceId: string | undefined;
  if (serviceCode) {
    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true },
    });
    serviceId = service?.id;
  }

  const campaigns = await prisma.marketingCampaign.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(type ? { type: type as any } : {}),
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    include: {
      services: { select: { service: { select: { id: true, name: true, code: true } } } },
      _count: { select: { posts: true, tasks: true } },
    },
    orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ campaigns, count: campaigns.length });
});
