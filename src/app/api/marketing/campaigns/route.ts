import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z
    .enum(["campaign", "event", "launch", "promotion", "awareness", "partnership"])
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
});

// GET /api/marketing/campaigns — list campaigns with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  const campaigns = await prisma.marketingCampaign.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(type ? { type: type as any } : {}),
    },
    include: {
      _count: {
        select: {
          posts: { where: { deleted: false } },
          comments: true,
        },
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(campaigns);
}

// POST /api/marketing/campaigns — create a new campaign
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const campaign = await prisma.marketingCampaign.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      status: parsed.data.status,
      startDate: parsed.data.startDate || null,
      endDate: parsed.data.endDate || null,
      platforms: parsed.data.platforms || [],
      goal: parsed.data.goal || null,
      notes: parsed.data.notes || null,
      designLink: parsed.data.designLink || null,
    },
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
      action: "create",
      entityType: "MarketingCampaign",
      entityId: campaign.id,
      details: { name: campaign.name, type: campaign.type },
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
