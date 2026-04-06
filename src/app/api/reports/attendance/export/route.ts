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

  const bookingWhere = {
    date: { gte: from, lte: to },
    status: { in: ["confirmed" as const, "waitlisted" as const] },
    ...(serviceId ? { serviceId } : {}),
  };

  const [bookingsByDay, records] = await Promise.all([
    prisma.booking.groupBy({
      by: ["date"],
      where: bookingWhere,
      _count: true,
      orderBy: { date: "asc" },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        signInTime: { gte: from, lte: to },
        ...(serviceId ? { serviceId } : {}),
      },
      select: { signInTime: true, signOutTime: true },
    }),
  ]);

  const attendanceByDay = new Map<string, { signedIn: number; signedOut: number }>();
  for (const r of records) {
    if (!r.signInTime) continue;
    const key = r.signInTime.toISOString().slice(0, 10);
    const entry = attendanceByDay.get(key) || { signedIn: 0, signedOut: 0 };
    entry.signedIn++;
    if (r.signOutTime) entry.signedOut++;
    attendanceByDay.set(key, entry);
  }

  const headers = ["Date", "Expected", "Signed In", "Signed Out", "No Shows"];
  const rows = bookingsByDay.map((b) => {
    const key = b.date.toISOString().slice(0, 10);
    const att = attendanceByDay.get(key) || { signedIn: 0, signedOut: 0 };
    return [key, b._count, att.signedIn, att.signedOut, Math.max(0, b._count - att.signedIn)];
  });

  const csv = generateCsv(headers, rows);
  return downloadCsvResponse(csv, `attendance-report-${dateFrom}-to-${dateTo}`);
}

export const GET = withApiAuth(handler, { minRole: "coordinator" });
