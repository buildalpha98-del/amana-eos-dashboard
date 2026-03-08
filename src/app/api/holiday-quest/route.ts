import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/holiday-quest — list Holiday Quest days
 * Query: serviceId (required), from, to, status
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

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
}

/**
 * POST /api/holiday-quest — create Holiday Quest days (bulk)
 * Body: { serviceId, days: [{ date, theme, morningActivity, afternoonActivity, ... }] }
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const { serviceId, days } = body as {
    serviceId?: string;
    days?: Array<{
      date: string;
      theme: string;
      morningActivity: string;
      afternoonActivity: string;
      isExcursion?: boolean;
      excursionVenue?: string;
      excursionCost?: number;
      materialsNeeded?: string;
      dietaryNotes?: string;
      maxCapacity?: number;
    }>;
  };

  if (!serviceId || !days || days.length === 0) {
    return NextResponse.json(
      { error: "serviceId and days array are required" },
      { status: 400 },
    );
  }

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true },
  });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Validate each day
  for (const day of days) {
    if (!day.date || !day.theme || !day.morningActivity || !day.afternoonActivity) {
      return NextResponse.json(
        { error: "Each day requires date, theme, morningActivity, and afternoonActivity" },
        { status: 400 },
      );
    }
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
}
