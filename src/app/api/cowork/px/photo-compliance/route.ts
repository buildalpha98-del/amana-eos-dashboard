import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  serviceCode: z.string().min(1),
  date: z.string().min(1),
  confirmed: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * POST /api/cowork/px/photo-compliance
 * Log daily photo compliance confirmation for a centre.
 * Used by: px-daily-photo-check, daily checklist automations
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
    const { serviceCode, date, confirmed, notes } = parsed.data;

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/px/photo-compliance", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
