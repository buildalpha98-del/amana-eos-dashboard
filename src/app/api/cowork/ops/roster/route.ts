import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const shiftSchema = z.object({
  date: z.string().min(1),
  staffName: z.string().min(1),
  shiftStart: z.string().min(1),
  shiftEnd: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]).optional(),
  role: z.string().nullable().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  shifts: z.array(shiftSchema).min(1),
});

/**
 * POST /api/cowork/ops/roster
 * Bulk upsert roster shifts for a service.
 * Used by: ops-roster-ratio-check, hr-staff-availability-forecast
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
    const { serviceCode, shifts } = parsed.data;

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
    logger.error("POST /cowork/ops/roster", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
