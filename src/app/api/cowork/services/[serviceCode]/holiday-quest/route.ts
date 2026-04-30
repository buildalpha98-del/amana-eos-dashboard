import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";

import { parseJsonBody } from "@/lib/api-error";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const postBodySchema = z.object({
  date: z.string().regex(DATE_RE, "date must be YYYY-MM-DD"),
  theme: z.string().min(1),
  morningActivity: z.string().min(1),
  afternoonActivity: z.string().min(1),
  isExcursion: z.boolean().optional(),
  excursionVenue: z.string().nullable().optional(),
  excursionCost: z.number().nullable().optional(),
  materialsNeeded: z.string().nullable().optional(),
  dietaryNotes: z.string().nullable().optional(),
  maxCapacity: z.number().optional(),
  status: z.string().optional(),
});

/**
 * POST /api/cowork/services/[serviceCode]/holiday-quest
 * Create or update a holiday quest day from automation output.
 * Upserts by [serviceId, date] unique constraint.
 */
export const POST = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const body = await parseJsonBody(req);
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
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
  } = parsed.data;

  const dateObj = parseDateUTC(date);

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
});

/**
 * GET /api/cowork/services/[serviceCode]/holiday-quest?from=2026-04-01&to=2026-04-14
 * Fetch holiday quest days for a centre within a date range.
 */
export const GET = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (from && !DATE_RE.test(from)) {
    return NextResponse.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
  }
  if (to && !DATE_RE.test(to)) {
    return NextResponse.json({ error: "to must be YYYY-MM-DD" }, { status: 400 });
  }

  const where: Record<string, unknown> = { serviceId: service.id };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = parseDateUTC(from);
    if (to) (where.date as Record<string, unknown>).lte = parseDateUTC(to);
  }

  const days = await prisma.holidayQuestDay.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json({ days });
});
