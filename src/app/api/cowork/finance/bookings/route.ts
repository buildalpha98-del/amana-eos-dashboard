import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const forecastSchema = z.object({
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  regular: z.number().optional(),
  casual: z.number().optional(),
  total: z.number().optional(),
  capacity: z.number().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  forecasts: z.array(forecastSchema).min(1),
});

/**
 * POST /api/cowork/finance/bookings
 * Bulk upsert booking forecasts for a service.
 * Used by: fin-booking-forecast, fin-casual-to-regular-conversion, ops-capacity-planner
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
    const { serviceCode, forecasts } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: `Service ${serviceCode} not found` },
        { status: 404 }
      );
    }

    let upserted = 0;
    for (const fc of forecasts) {
      const dateObj = new Date(fc.date + "T00:00:00Z");
      await prisma.bookingForecast.upsert({
        where: {
          serviceId_date_sessionType: {
            serviceId: service.id,
            date: dateObj,
            sessionType: fc.sessionType,
          },
        },
        update: {
          regular: fc.regular || 0,
          casual: fc.casual || 0,
          total: fc.total || (fc.regular || 0) + (fc.casual || 0),
          capacity: fc.capacity || 0,
          syncedAt: new Date(),
        },
        create: {
          serviceId: service.id,
          date: dateObj,
          sessionType: fc.sessionType,
          regular: fc.regular || 0,
          casual: fc.casual || 0,
          total: fc.total || (fc.regular || 0) + (fc.casual || 0),
          capacity: fc.capacity || 0,
        },
      });
      upserted++;
    }

    return NextResponse.json(
      { message: "Booking forecasts synced", serviceCode, upserted },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/finance/bookings", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
