import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/finance/attendance
 * Bulk upsert daily attendance records for a service.
 * Used by: fin-daily-attendance-reconciler, fin-ccs-claim-tracker, ops-utilisation-dashboard
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, records } = body;

  if (!serviceCode || !records || !Array.isArray(records)) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "serviceCode and records[] required",
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
  for (const rec of records) {
    const dateObj = new Date(rec.date + "T00:00:00Z");
    await prisma.dailyAttendance.upsert({
      where: {
        serviceId_date_sessionType: {
          serviceId: service.id,
          date: dateObj,
          sessionType: rec.sessionType,
        },
      },
      update: {
        enrolled: rec.enrolled || 0,
        attended: rec.attended || 0,
        capacity: rec.capacity || 0,
        casual: rec.casual || 0,
        absent: rec.absent || 0,
        notes: rec.notes || null,
      },
      create: {
        serviceId: service.id,
        date: dateObj,
        sessionType: rec.sessionType,
        enrolled: rec.enrolled || 0,
        attended: rec.attended || 0,
        capacity: rec.capacity || 0,
        casual: rec.casual || 0,
        absent: rec.absent || 0,
        notes: rec.notes || null,
      },
    });
    upserted++;
  }

  return NextResponse.json(
    {
      message: "Attendance records synced",
      serviceCode,
      upserted,
    },
    { status: 201 }
  );
}
