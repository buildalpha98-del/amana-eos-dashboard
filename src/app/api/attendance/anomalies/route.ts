import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

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
}
