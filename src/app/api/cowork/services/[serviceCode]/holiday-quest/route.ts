import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/services/[serviceCode]/holiday-quest
 * Create or update a holiday quest day from automation output.
 * Upserts by [serviceId, date] unique constraint.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await params;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const body = await req.json();
  const {
    date,
    theme,
    morningActivity,
    afternoonActivity,
    isExcursion,
    excursionVenue,
    excursionCost,
    materialsNeeded,
    dietaryNotes,
    maxCapacity,
    status,
  } = body;

  if (!date || !theme || !morningActivity || !afternoonActivity) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message:
          "date, theme, morningActivity, and afternoonActivity are required",
      },
      { status: 400 }
    );
  }

  const dateObj = new Date(date);

  const day = await prisma.holidayQuestDay.upsert({
    where: {
      serviceId_date: {
        serviceId: service.id,
        date: dateObj,
      },
    },
    create: {
      serviceId: service.id,
      date: dateObj,
      theme,
      morningActivity,
      afternoonActivity,
      isExcursion: isExcursion || false,
      excursionVenue: excursionVenue || null,
      excursionCost: excursionCost || null,
      materialsNeeded: materialsNeeded || null,
      dietaryNotes: dietaryNotes || null,
      maxCapacity: maxCapacity || 40,
      status: status || "draft",
    },
    update: {
      theme,
      morningActivity,
      afternoonActivity,
      isExcursion: isExcursion ?? undefined,
      excursionVenue: excursionVenue || undefined,
      excursionCost: excursionCost ?? undefined,
      materialsNeeded: materialsNeeded || undefined,
      dietaryNotes: dietaryNotes || undefined,
      maxCapacity: maxCapacity ?? undefined,
      status: status || undefined,
    },
  });

  return NextResponse.json(
    {
      message: "Holiday quest day created/updated",
      dayId: day.id,
      serviceCode,
      date: day.date,
      theme: day.theme,
      status: day.status,
    },
    { status: 201 }
  );
}

/**
 * GET /api/cowork/services/[serviceCode]/holiday-quest?from=2026-04-01&to=2026-04-14
 * Fetch holiday quest days for a centre within a date range.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await params;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { serviceId: service.id };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const days = await prisma.holidayQuestDay.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ days });
}
