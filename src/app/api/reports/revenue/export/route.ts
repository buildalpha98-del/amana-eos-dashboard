import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { generateCsv, downloadCsvResponse } from "@/lib/reports/exportCsv";

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

  const statements = await prisma.statement.findMany({
    where: {
      periodStart: { gte: from, lte: to },
      ...(serviceId ? { serviceId } : {}),
    },
    select: { totalFees: true, totalCcs: true, gapFee: true, balance: true, periodStart: true },
  });

  const payments = await prisma.payment.findMany({
    where: {
      receivedAt: { gte: from, lte: to },
      ...(serviceId ? { statement: { serviceId } } : {}),
    },
    select: { amount: true, receivedAt: true },
  });

  const weekMap = new Map<string, { grossFees: number; ccs: number; gap: number; payments: number }>();
  for (const s of statements) {
    const d = new Date(s.periodStart);
    d.setDate(d.getDate() - d.getDay());
    const key = d.toISOString().slice(0, 10);
    const e = weekMap.get(key) || { grossFees: 0, ccs: 0, gap: 0, payments: 0 };
    e.grossFees += s.totalFees;
    e.ccs += s.totalCcs;
    e.gap += s.gapFee;
    weekMap.set(key, e);
  }
  for (const p of payments) {
    const d = new Date(p.receivedAt);
    d.setDate(d.getDate() - d.getDay());
    const key = d.toISOString().slice(0, 10);
    const e = weekMap.get(key) || { grossFees: 0, ccs: 0, gap: 0, payments: 0 };
    e.payments += p.amount;
    weekMap.set(key, e);
  }

  const rows = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => [week, d.grossFees.toFixed(2), d.ccs.toFixed(2), d.gap.toFixed(2), d.payments.toFixed(2)]);

  const csv = generateCsv(["Week Starting", "Gross Fees", "CCS Estimate", "Gap Fees", "Payments Received"], rows);
  return downloadCsvResponse(csv, `revenue-report-${dateFrom}-to-${dateTo}`);
}

export const GET = withApiAuth(handler, { minRole: "coordinator" });
