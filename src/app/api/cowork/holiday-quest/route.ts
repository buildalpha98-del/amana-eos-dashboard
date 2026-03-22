import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { resolveServiceByCode } from "../_lib/resolve-service";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const holidayDaySchema = z.object({
  date: z.string().min(1),
  theme: z.string().min(1),
  morningActivity: z.string().min(1),
  afternoonActivity: z.string().min(1),
  isExcursion: z.boolean().optional(),
  excursionVenue: z.string().nullable().optional(),
  excursionCost: z.number().nullable().optional(),
  materialsNeeded: z.string().nullable().optional(),
  dietaryNotes: z.string().nullable().optional(),
  maxCapacity: z.number().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  days: z.array(holidayDaySchema).min(1),
});

/**
 * POST /api/cowork/holiday-quest — Create/update Holiday Quest days via API key
 *
 * Body: { serviceCode, days: [{ date, theme, morningActivity, afternoonActivity, ... }] }
 * Auth: API key with "holiday-quest:write" scope
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, days } = parsed.data;

    const service = await resolveServiceByCode(serviceCode);
    if (!service) {
      return NextResponse.json(
        { error: `Service not found: ${serviceCode}` },
        { status: 404 },
      );
    }

    // Upsert each day
    const results = await Promise.all(
      days.map((day) =>
        prisma.holidayQuestDay.upsert({
          where: {
            serviceId_date: { serviceId: service.id, date: new Date(day.date) },
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
            serviceId: service.id,
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

    return NextResponse.json({
      success: true,
      serviceCode,
      daysUpserted: results.length,
    });
  } catch (err) {
    logger.error("Cowork Holiday Quest POST", { err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
});
