import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const postSchema = z.object({
  serviceId: z.string().min(1),
  days: z.array(z.object({
    date: z.string().min(1),
    theme: z.string().min(1),
    morningActivity: z.string().min(1),
    afternoonActivity: z.string().min(1),
    isExcursion: z.boolean().optional(),
    excursionVenue: z.string().optional(),
    excursionCost: z.number().optional(),
    materialsNeeded: z.string().optional(),
    dietaryNotes: z.string().optional(),
    maxCapacity: z.number().optional(),
  })).min(1),
});
/**
 * GET /api/holiday-quest — list Holiday Quest days
 * Query: serviceId (required), from, to, status
 */
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");

  if (!serviceId) {
    return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { serviceId };
  if (status) where.status = status;
  if (from || to) {
    where.date = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const days = await prisma.holidayQuestDay.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json(days);
});

/**
 * POST /api/holiday-quest — create Holiday Quest days (bulk)
 * Body: { serviceId, days: [{ date, theme, morningActivity, afternoonActivity, ... }] }
 */
export const POST = withApiAuth(async (req, session) => {
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { serviceId, days } = parsed.data;

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true },
  });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Upsert each day (serviceId+date is unique)
  const results = await Promise.all(
    days.map((day) =>
      prisma.holidayQuestDay.upsert({
        where: {
          serviceId_date: { serviceId, date: new Date(day.date) },
        },
        update: {
          theme: day.theme,
          morningActivity: day.morningActivity,
          afternoonActivity: day.afternoonActivity,
          isExcursion: day.isExcursion ?? false,
          excursionVenue: day.excursionVenue ?? null,
          excursionCost: day.excursionCost ?? null,
          materialsNeeded: day.materialsNeeded ?? null,
          dietaryNotes: day.dietaryNotes ?? null,
          maxCapacity: day.maxCapacity ?? 40,
        },
        create: {
          serviceId,
          date: new Date(day.date),
          theme: day.theme,
          morningActivity: day.morningActivity,
          afternoonActivity: day.afternoonActivity,
          isExcursion: day.isExcursion ?? false,
          excursionVenue: day.excursionVenue ?? null,
          excursionCost: day.excursionCost ?? null,
          materialsNeeded: day.materialsNeeded ?? null,
          dietaryNotes: day.dietaryNotes ?? null,
          maxCapacity: day.maxCapacity ?? 40,
        },
      }),
    ),
  );

  return NextResponse.json({ created: results.length, days: results });
}, { roles: ["owner", "head_office", "admin"] });
