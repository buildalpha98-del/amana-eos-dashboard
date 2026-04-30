import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") || undefined;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "dateFrom and dateTo are required" }, { status: 400 });
  }

  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  to.setHours(23, 59, 59, 999);

  const where = {
    date: { gte: from, lte: to },
    ...(serviceId ? { serviceId } : {}),
  };

  const [totalBookings, byStatusRaw, bySessionRaw, byTypeRaw, confirmedBookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.groupBy({ by: ["status"], where, _count: true }),
    prisma.booking.groupBy({ by: ["sessionType"], where, _count: true }),
    prisma.booking.groupBy({ by: ["type"], where, _count: true }),
    prisma.booking.findMany({
      where: { ...where, status: "confirmed", reviewedAt: { not: null } },
      select: { createdAt: true, reviewedAt: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    ["requested", "confirmed", "declined", "cancelled"].map((s) => [
      s,
      byStatusRaw.find((r) => r.status === s)?._count ?? 0,
    ]),
  );

  const bySessionType = Object.fromEntries(
    ["bsc", "asc", "vc"].map((s) => [
      s.toUpperCase(),
      bySessionRaw.find((r) => r.sessionType === s)?._count ?? 0,
    ]),
  );

  const casualVsPermanent = {
    casual: byTypeRaw.find((r) => r.type === "casual")?._count ?? 0,
    permanent: byTypeRaw.find((r) => r.type === "permanent")?._count ?? 0,
  };

  // Average approval time in hours
  let averageApprovalTimeHours = 0;
  if (confirmedBookings.length > 0) {
    const totalMs = confirmedBookings.reduce((sum, b) => {
      if (!b.reviewedAt) return sum;
      return sum + (b.reviewedAt.getTime() - b.createdAt.getTime());
    }, 0);
    averageApprovalTimeHours = Math.round((totalMs / confirmedBookings.length / 3600000) * 10) / 10;
  }

  return NextResponse.json({
    totalBookings,
    byStatus,
    bySessionType,
    casualVsPermanent,
    averageApprovalTimeHours,
  });
}

export const GET = withApiAuth(handler, { minRole: "member" });
