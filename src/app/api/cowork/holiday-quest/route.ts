import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { resolveServiceByCode } from "../_lib/resolve-service";

/**
 * POST /api/cowork/holiday-quest — Create/update Holiday Quest days via API key
 *
 * Body: { serviceCode, days: [{ date, theme, morningActivity, afternoonActivity, ... }] }
 * Auth: API key with "holiday-quest:write" scope
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { serviceCode, days } = body as {
      serviceCode?: string;
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

    if (!serviceCode || !days || days.length === 0) {
      return NextResponse.json(
        { error: "serviceCode and days array are required" },
        { status: 400 },
      );
    }

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
    console.error("[Cowork Holiday Quest POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
