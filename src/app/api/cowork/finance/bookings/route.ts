import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/finance/bookings
 * Bulk upsert booking forecasts for a service.
 * Used by: fin-booking-forecast, fin-casual-to-regular-conversion, ops-capacity-planner
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { serviceCode, forecasts } = body;

    if (!serviceCode || !forecasts || !Array.isArray(forecasts)) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: "serviceCode and forecasts[] required",
        },
        { status: 400 }
      );
    }

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: "Not Found", message: `Service ${serviceCode} not found` },
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
    console.error("[POST /cowork/finance/bookings]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}
