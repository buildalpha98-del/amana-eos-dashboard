import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const attendanceRecordSchema = z.object({
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  enrolled: z.number().optional(),
  attended: z.number().optional(),
  capacity: z.number().optional(),
  casual: z.number().optional(),
  absent: z.number().optional(),
  notes: z.string().nullable().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  records: z.array(attendanceRecordSchema).min(1),
});

/**
 * POST /api/cowork/finance/attendance
 * Bulk upsert daily attendance records for a service.
 * Used by: fin-daily-attendance-reconciler, fin-ccs-claim-tracker, ops-utilisation-dashboard
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, records } = parsed.data;

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/finance/attendance", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
