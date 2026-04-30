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

  const stmtWhere = {
    periodStart: { gte: from, lte: to },
    ...(serviceId ? { serviceId } : {}),
  };

  const payWhere = {
    receivedAt: { gte: from, lte: to },
    ...(serviceId ? { statement: { serviceId } } : {}),
  };

  const [statements, payments, overdueCount, byServiceRaw] = await Promise.all([
    prisma.statement.findMany({
      where: stmtWhere,
      select: { totalFees: true, totalCcs: true, gapFee: true, balance: true, periodStart: true },
    }),
    prisma.payment.findMany({
      where: payWhere,
      select: { amount: true, receivedAt: true },
    }),
    prisma.statement.count({ where: { ...stmtWhere, status: "overdue" } }),
    prisma.statement.findMany({
      where: stmtWhere,
      select: {
        totalFees: true,
        gapFee: true,
        balance: true,
        service: { select: { name: true } },
      },
    }),
  ]);

  const totalGrossFees = statements.reduce((s, r) => s + r.totalFees, 0);
  const totalCcsEstimate = statements.reduce((s, r) => s + r.totalCcs, 0);
  const totalGapFees = statements.reduce((s, r) => s + r.gapFee, 0);
  const totalPaymentsReceived = payments.reduce((s, r) => s + r.amount, 0);
  const totalOutstanding = statements.reduce((s, r) => s + Math.max(0, r.balance), 0);

  // byWeek
  const weekMap = new Map<string, { grossFees: number; ccsEstimate: number; gapFees: number; paymentsReceived: number }>();
  for (const s of statements) {
    const d = new Date(s.periodStart);
    d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
    const key = d.toISOString().slice(0, 10);
    const entry = weekMap.get(key) || { grossFees: 0, ccsEstimate: 0, gapFees: 0, paymentsReceived: 0 };
    entry.grossFees += s.totalFees;
    entry.ccsEstimate += s.totalCcs;
    entry.gapFees += s.gapFee;
    weekMap.set(key, entry);
  }
  for (const p of payments) {
    const d = new Date(p.receivedAt);
    d.setDate(d.getDate() - d.getDay());
    const key = d.toISOString().slice(0, 10);
    const entry = weekMap.get(key) || { grossFees: 0, ccsEstimate: 0, gapFees: 0, paymentsReceived: 0 };
    entry.paymentsReceived += p.amount;
    weekMap.set(key, entry);
  }
  const byWeek = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStarting, data]) => ({ weekStarting, ...data }));

  // byService
  const serviceMap = new Map<string, { grossFees: number; gapFees: number; outstanding: number }>();
  for (const s of byServiceRaw) {
    const name = s.service.name;
    const entry = serviceMap.get(name) || { grossFees: 0, gapFees: 0, outstanding: 0 };
    entry.grossFees += s.totalFees;
    entry.gapFees += s.gapFee;
    entry.outstanding += Math.max(0, s.balance);
    serviceMap.set(name, entry);
  }
  const byService = Array.from(serviceMap.entries()).map(([serviceName, data]) => ({
    serviceName,
    ...data,
    paymentsReceived: 0, // would need a join to compute per-service
  }));

  return NextResponse.json({
    totalGrossFees: Math.round(totalGrossFees * 100) / 100,
    totalCcsEstimate: Math.round(totalCcsEstimate * 100) / 100,
    totalGapFees: Math.round(totalGapFees * 100) / 100,
    totalPaymentsReceived: Math.round(totalPaymentsReceived * 100) / 100,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    overdueCount,
    byWeek,
    byService,
  });
}

export const GET = withApiAuth(handler, { minRole: "member" });
