import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/finance/conversions
 * Upsert conversion opportunities identified by automation.
 * Used by: fin-casual-to-regular-conversion, mktg-casual-conversion-campaign
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, opportunities } = body;

  if (!serviceCode || !opportunities || !Array.isArray(opportunities)) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "serviceCode and opportunities[] required",
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
}
