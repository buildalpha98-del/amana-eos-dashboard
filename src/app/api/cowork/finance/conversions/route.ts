import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const opportunitySchema = z.object({
  familyRef: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  casualCount: z.number().optional(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  contactedAt: z.string().nullable().optional(),
  convertedAt: z.string().nullable().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  opportunities: z.array(opportunitySchema).min(1),
});

/**
 * POST /api/cowork/finance/conversions
 * Upsert conversion opportunities identified by automation.
 * Used by: fin-casual-to-regular-conversion, mktg-casual-conversion-campaign
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
    const { serviceCode, opportunities } = parsed.data;

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

    let created = 0,
      updated = 0;
    for (const opp of opportunities) {
      const periodStart = new Date(opp.periodStart + "T00:00:00Z");
      const periodEnd = new Date(opp.periodEnd + "T00:00:00Z");

      const existing = await prisma.conversionOpportunity.findUnique({
        where: {
          serviceId_familyRef_sessionType_periodStart: {
            serviceId: service.id,
            familyRef: opp.familyRef,
            sessionType: opp.sessionType,
            periodStart,
          },
        },
      });

      if (existing) {
        await prisma.conversionOpportunity.update({
          where: { id: existing.id },
          data: {
            casualCount: opp.casualCount ?? existing.casualCount,
            status: opp.status || existing.status,
            notes: opp.notes || existing.notes,
            contactedAt: opp.contactedAt
              ? new Date(opp.contactedAt)
              : existing.contactedAt,
            convertedAt: opp.convertedAt
              ? new Date(opp.convertedAt)
              : existing.convertedAt,
          },
        });
        updated++;
      } else {
        await prisma.conversionOpportunity.create({
          data: {
            serviceId: service.id,
            familyRef: opp.familyRef,
            sessionType: opp.sessionType,
            casualCount: opp.casualCount || 0,
            periodStart,
            periodEnd,
            status: opp.status || "identified",
            notes: opp.notes || null,
          },
        });
        created++;
      }
    }

    return NextResponse.json(
      {
        message: "Conversion opportunities processed",
        serviceCode,
        created,
        updated,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/finance/conversions", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
