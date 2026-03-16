import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/px/photo-compliance
 * Log daily photo compliance confirmation for a centre.
 * Used by: px-daily-photo-check, daily checklist automations
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, date, confirmed, notes } = body;

  if (!serviceCode || !date) {
    return NextResponse.json(
      { error: "Bad Request", message: "serviceCode and date required" },
      { status: 400 }
    );
  }

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

  const dateObj = new Date(date + "T00:00:00Z");

  const log = await prisma.photoComplianceLog.upsert({
    where: {
      serviceId_date: { serviceId: service.id, date: dateObj },
    },
    update: {
      confirmed: confirmed ?? false,
      confirmedAt: confirmed ? new Date() : null,
      notes: notes || null,
    },
    create: {
      serviceId: service.id,
      date: dateObj,
      confirmed: confirmed ?? false,
      confirmedAt: confirmed ? new Date() : null,
      notes: notes || null,
    },
  });

  return NextResponse.json(
    {
      message: "Photo compliance logged",
      serviceCode,
      date,
      confirmed: log.confirmed,
    },
    { status: 201 }
  );
}
