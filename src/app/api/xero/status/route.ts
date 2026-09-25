import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(async (req, session) => {
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
}, { roles: [...ADMIN_ROLES] });
