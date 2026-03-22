import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

// ── Validation ──────────────────────────────────────────────

const ACTIVITY_CATEGORIES = [
  "physical_play",
  "creative_arts",
  "music_movement",
  "literacy",
  "numeracy",
  "nature_outdoors",
  "cooking_nutrition",
  "social_emotional",
  "quiet_time",
  "free_play",
  "quran_iqra",
  "homework_help",
  "stem_science",
  "other",
] as const;

const activityTemplateItem = z.object({
  title: z.string().min(1, "title is required").max(200),
  description: z.string().max(2000).optional(),
  howTo: z.string().max(2000).optional(),
  resourcesNeeded: z.string().max(1000).optional(),
  category: z
    .enum([...ACTIVITY_CATEGORIES], {
      error: `category must be one of: ${ACTIVITY_CATEGORIES.join(", ")}`,
    })
    .default("other"),
  ageGroup: z.string().max(50).optional(),
  durationMinutes: z.number().int().positive().optional(),
});

const bulkImportSchema = z.object({
  templates: z
    .array(activityTemplateItem)
    .min(1, "At least one template is required")
    .max(100, "Maximum 100 templates per request"),
});

// POST /api/cowork/bulk-import — Bulk upsert activity templates
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  // Rate limit: 10 req/min (use a fixed key id for cowork bearer)

  try {
    const body = await req.json();
    const parsed = bulkImportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { templates } = parsed.data;

    // Upsert each template (match by title for idempotency)
    const results: { title: string; action: "created" | "updated" }[] = [];

    for (const tpl of templates) {
      const existing = await prisma.activityTemplate.findFirst({
        where: { title: tpl.title, deleted: false },
      });

      if (existing) {
        await prisma.activityTemplate.update({
          where: { id: existing.id },
          data: {
            description: tpl.description ?? existing.description,
            howTo: tpl.howTo ?? existing.howTo,
            resourcesNeeded: tpl.resourcesNeeded ?? existing.resourcesNeeded,
            category: tpl.category,
            ageGroup: tpl.ageGroup ?? existing.ageGroup,
            durationMinutes: tpl.durationMinutes ?? existing.durationMinutes,
          },
        });
        results.push({ title: tpl.title, action: "updated" });
      } else {
        await prisma.activityTemplate.create({
          data: {
            title: tpl.title,
            description: tpl.description ?? null,
            howTo: tpl.howTo ?? null,
            resourcesNeeded: tpl.resourcesNeeded ?? null,
            category: tpl.category,
            ageGroup: tpl.ageGroup ?? null,
            durationMinutes: tpl.durationMinutes ?? null,
          },
        });
        results.push({ title: tpl.title, action: "created" });
      }
    }

    const created = results.filter((r) => r.action === "created").length;
    const updated = results.filter((r) => r.action === "updated").length;

    return NextResponse.json(
      {
        summary: { total: results.length, created, updated },
        results,
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Cowork Bulk Import Templates", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

// GET /api/cowork/bulk-import — Retrieve activity templates with filters
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const ageGroup = searchParams.get("ageGroup");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { deleted: false };
    if (category) where.category = category;
    if (ageGroup) where.ageGroup = { contains: ageGroup, mode: "insensitive" };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const templates = await prisma.activityTemplate.findMany({
      where,
      orderBy: { title: "asc" },
      take: 100,
      include: {
        files: {
          select: { id: true, fileName: true, fileUrl: true },
        },
      },
    });

    return NextResponse.json({ templates, total: templates.length });
  } catch (err) {
    logger.error("Cowork Bulk Import GET", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
