import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/ops/roster
 * Bulk upsert roster shifts for a service.
 * Used by: ops-roster-ratio-check, hr-staff-availability-forecast
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { serviceCode, shifts } = body;

    if (!serviceCode || !shifts || !Array.isArray(shifts)) {
      return NextResponse.json(
        {
          error: "Bad Request",
          message: "serviceCode and shifts[] required",
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
    for (const shift of shifts) {
      const dateObj = new Date(shift.date + "T00:00:00Z");
      await prisma.rosterShift.upsert({
        where: {
          serviceId_date_staffName_shiftStart: {
            serviceId: service.id,
            date: dateObj,
            staffName: shift.staffName,
            shiftStart: shift.shiftStart,
          },
        },
        update: {
          shiftEnd: shift.shiftEnd,
          sessionType: shift.sessionType || "asc",
          role: shift.role || null,
          syncedAt: new Date(),
        },
        create: {
          serviceId: service.id,
          date: dateObj,
          sessionType: shift.sessionType || "asc",
          staffName: shift.staffName,
          shiftStart: shift.shiftStart,
          shiftEnd: shift.shiftEnd,
          role: shift.role || null,
        },
      });
      upserted++;
    }

    return NextResponse.json(
      { message: "Roster shifts synced", serviceCode, upserted },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /cowork/ops/roster]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}
