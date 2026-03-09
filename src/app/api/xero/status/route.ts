import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const connection = await prisma.xeroConnection.findUnique({
    where: { id: "singleton" },
    select: {
      status: true,
      tenantName: true,
      trackingCategoryId: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncError: true,
      syncedFinancialPeriods: true,
    },
  });

  if (!connection) {
    return NextResponse.json({ status: "disconnected" });
  }

  const [mappedCentres, accountMappings] = await Promise.all([
    prisma.service.count({
      where: { xeroTrackingOptionId: { not: null } },
    }),
    prisma.xeroAccountMapping.count(),
  ]);

  return NextResponse.json({
    ...connection,
    mappedCentres,
    accountMappings,
  });
}
