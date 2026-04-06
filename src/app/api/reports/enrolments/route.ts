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
    createdAt: { gte: from, lte: to },
    ...(serviceId ? { serviceId } : {}),
  };

  const [total, byStatusRaw, approved, byServiceRaw] = await Promise.all([
    prisma.enrolmentApplication.count({ where }),
    prisma.enrolmentApplication.groupBy({ by: ["status"], where, _count: true }),
    prisma.enrolmentApplication.findMany({
      where: { ...where, status: "approved", reviewedAt: { not: null } },
      select: { createdAt: true, reviewedAt: true },
    }),
    prisma.enrolmentApplication.findMany({
      where,
      select: { status: true, service: { select: { name: true } } },
    }),
  ]);

  const byStatus = Object.fromEntries(
    ["pending", "approved", "declined", "withdrawn"].map((s) => [
      s,
      byStatusRaw.find((r) => r.status === s)?._count ?? 0,
    ]),
  );

  const approvedCount = byStatus.approved ?? 0;
  const declinedCount = byStatus.declined ?? 0;
  const approvalRate = approvedCount + declinedCount > 0
    ? Math.round((approvedCount / (approvedCount + declinedCount)) * 100)
    : 0;

  let averageApprovalTimeHours = 0;
  if (approved.length > 0) {
    const totalMs = approved.reduce((sum, a) => {
      if (!a.reviewedAt) return sum;
      return sum + (a.reviewedAt.getTime() - a.createdAt.getTime());
    }, 0);
    averageApprovalTimeHours = Math.round((totalMs / approved.length / 3600000) * 10) / 10;
  }

  // byService
  const serviceMap = new Map<string, { total: number; approved: number; declined: number; pending: number }>();
  for (const a of byServiceRaw) {
    const name = a.service.name;
    const e = serviceMap.get(name) || { total: 0, approved: 0, declined: 0, pending: 0 };
    e.total++;
    if (a.status === "approved") e.approved++;
    if (a.status === "declined") e.declined++;
    if (a.status === "pending") e.pending++;
    serviceMap.set(name, e);
  }
  const byService = Array.from(serviceMap.entries()).map(([serviceName, data]) => ({
    serviceName,
    ...data,
  }));

  // byMonth
  const monthMap = new Map<string, { applications: number; approvals: number }>();
  for (const a of byServiceRaw) {
    // We need createdAt to group — re-fetch or use a different approach
    // For simplicity, we'll build from the raw data
  }
  // Build byMonth from a separate query
  const allApps = await prisma.enrolmentApplication.findMany({
    where,
    select: { createdAt: true, status: true },
  });
  for (const a of allApps) {
    const key = `${a.createdAt.getFullYear()}-${String(a.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const e = monthMap.get(key) || { applications: 0, approvals: 0 };
    e.applications++;
    if (a.status === "approved") e.approvals++;
    monthMap.set(key, e);
  }
  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  return NextResponse.json({
    totalApplications: total,
    byStatus,
    approvalRate,
    averageApprovalTimeHours,
    byService,
    byMonth,
  });
}

export const GET = withApiAuth(handler, { minRole: "coordinator" });
