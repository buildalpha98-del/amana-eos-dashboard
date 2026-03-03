import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  platform: z.enum([
    "facebook",
    "instagram",
    "linkedin",
    "email",
    "newsletter",
    "website",
    "flyer",
  ]),
  pillar: z.string().optional(),
  content: z.string().min(1, "Content is required"),
  notes: z.string().optional(),
  hashtags: z.string().optional(),
});

// GET /api/marketing/templates — list templates with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");

  const templates = await prisma.marketingTemplate.findMany({
    where: {
      deleted: false,
      ...(platform ? { platform: platform as any } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(templates);
}

// POST /api/marketing/templates — create a new template
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const template = await prisma.marketingTemplate.create({
    data: {
      name: parsed.data.name,
      platform: parsed.data.platform,
      pillar: parsed.data.pillar || null,
      content: parsed.data.content,
      notes: parsed.data.notes || null,
      hashtags: parsed.data.hashtags || null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "MarketingTemplate",
      entityId: template.id,
      details: { name: template.name, platform: template.platform },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
