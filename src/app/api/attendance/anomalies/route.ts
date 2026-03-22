import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const dismissed = req.nextUrl.searchParams.get("dismissed");

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (dismissed === "false") where.dismissed = false;
  if (dismissed === "true") where.dismissed = true;

  const anomalies = await prisma.attendanceAnomaly.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(anomalies);
});
