import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const CATEGORIES = [
  "physical_play", "creative_arts", "music_movement", "literacy", "numeracy",
  "nature_outdoors", "cooking_nutrition", "social_emotional", "quiet_time", "free_play", "other",
] as const;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  howTo: z.string().max(5000).optional().nullable(),
  resourcesNeeded: z.string().max(2000).optional().nullable(),
  category: z.enum(CATEGORIES).optional(),
  ageGroup: z.string().max(50).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(480).optional().nullable(),
});

// GET /api/activity-templates?category=X&search=X&page=1&limit=20
export const GET = withApiAuth(async (req, session) => {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));

  const where: Record<string, unknown> = { deleted: false };
  if (category && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    where.category = category;
  }
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }

  const [templates, total] = await Promise.all([
    prisma.activityTemplate.findMany({
      where,
      include: {
        files: { orderBy: { createdAt: "desc" } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityTemplate.count({ where }),
  ]);

  return NextResponse.json({ templates, total, page, limit });
});

// POST /api/activity-templates
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await prisma.activityTemplate.create({
    data: {
      ...parsed.data,
      createdById: session!.user.id,
    },
    include: {
      files: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ActivityTemplate",
      entityId: template.id,
      details: { title: template.title, category: template.category },
    },
  });

  return NextResponse.json(template, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
