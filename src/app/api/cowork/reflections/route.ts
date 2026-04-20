import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
// ── Validation ──────────────────────────────────────────────

const REFLECTION_TYPES = [
  "daily_reflection",
  "friday_review",
  "child_observation",
  "iqra_feedback",
] as const;

const reflectionSchema = z.object({
  centreId: z.string().min(1, "centreId is required"),
  educatorName: z.string().min(1, "educatorName is required"),
  reflectionType: z.enum([...REFLECTION_TYPES], {
    error: `reflectionType must be one of: ${REFLECTION_TYPES.join(", ")}`,
  }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "date must be ISO format (YYYY-MM-DD)")
    .transform((v) => new Date(v))
    .refine((d) => !isNaN(d.getTime()), "Invalid date"),
  content: z.record(z.string(), z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    "content must be a non-empty object",
  ),
  tags: z.array(z.string()).default([]),
  linkedActivityId: z.string().optional(),
});

const bulkReflectionSchema = z.object({
  reflections: z
    .array(reflectionSchema)
    .min(1, "At least one reflection is required")
    .max(50, "Maximum 50 reflections per request"),
});

// POST /api/cowork/reflections — Create educator reflections
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = (await parseJsonBody(req)) as Record<string, unknown>;

    // Support both single and bulk
    const isBulk = "reflections" in body;
    const parsed = isBulk
      ? bulkReflectionSchema.safeParse(body)
      : reflectionSchema.safeParse(body);

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

    const items = isBulk
      ? (parsed.data as z.infer<typeof bulkReflectionSchema>).reflections
      : [parsed.data as z.infer<typeof reflectionSchema>];

    const created = await prisma.$transaction(
      items.map((r) =>
        prisma.educatorReflection.create({
          data: {
            centreId: r.centreId,
            educatorName: r.educatorName,
            reflectionType: r.reflectionType,
            date: r.date,
            content: r.content as object,
            tags: r.tags,
            linkedActivityId: r.linkedActivityId ?? null,
          },
        }),
      ),
    );

    return NextResponse.json(
      {
        message: `${created.length} reflection${created.length !== 1 ? "s" : ""} created`,
        reflections: created,
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Cowork Reflections POST", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

// GET /api/cowork/reflections — Retrieve reflections with filters
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const centreId = searchParams.get("centreId");
    const type = searchParams.get("type");
    const educatorName = searchParams.get("educatorName");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const where: Record<string, unknown> = {};
    if (centreId) where.centreId = centreId;
    if (type) where.reflectionType = type;
    if (educatorName) {
      where.educatorName = { contains: educatorName, mode: "insensitive" };
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.date = dateFilter;
    }

    const reflections = await prisma.educatorReflection.findMany({
      where,
      orderBy: { date: "desc" },
      take: limit,
    });

    return NextResponse.json({ reflections, total: reflections.length });
  } catch (err) {
    logger.error("Cowork Reflections GET", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
