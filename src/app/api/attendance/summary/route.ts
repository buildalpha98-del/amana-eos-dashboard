import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope, getStateScope } from "@/lib/service-scope";

/**
 * GET /api/attendance/summary
 *
 * Returns aggregated attendance/occupancy data.
 * Query params:
 *   - serviceId (optional, scoped automatically for staff/member)
 *   - from (ISO date)
 *   - to   (ISO date)
 *   - period: "weekly" | "monthly" (default "weekly")
 */
export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const period = searchParams.get("period") || "weekly";

  // Service scope
  const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const effectiveServiceId = scope || serviceId;

  if (scope && serviceId && serviceId !== scope) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Default: last 13 weeks
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - 13 * 7 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    date: { gte: fromDate, lte: toDate },
  };
  if (effectiveServiceId) where.serviceId = effectiveServiceId;
  // State Manager: only see attendance for services in their assigned state
  if (stateScope) where.service = { state: stateScope };

  const records = await prisma.dailyAttendance.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: { date: "asc" },
  });

  // Aggregate by period
  const buckets: Record<
    string,
    {
      period: string;
      bsc: { enrolled: number; attended: number; capacity: number; casual: number };
      asc: { enrolled: number; attended: number; capacity: number; casual: number };
      vc: { enrolled: number; attended: number; capacity: number; casual: number };
      bscDays: number;
      ascDays: number;
      vcDays: number;
    }
  > = {};

  for (const r of records) {
    const d = new Date(r.date);
    let key: string;

    if (period === "monthly") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } else {
      // ISO week: Monday-based
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const dayOfYear = Math.floor(
        (d.getTime() - jan1.getTime()) / 86400000
      );
      const weekNum = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    }

    if (!buckets[key]) {
      buckets[key] = {
        period: key,
        bsc: { enrolled: 0, attended: 0, capacity: 0, casual: 0 },
        asc: { enrolled: 0, attended: 0, capacity: 0, casual: 0 },
        vc: { enrolled: 0, attended: 0, capacity: 0, casual: 0 },
        bscDays: 0,
        ascDays: 0,
        vcDays: 0,
      };
    }

    const b = buckets[key];
    const session_type = r.sessionType;

    if (session_type === "bsc") {
      b.bsc.enrolled += r.enrolled;
      b.bsc.attended += r.attended;
      b.bsc.capacity += r.capacity;
      b.bsc.casual += r.casual;
      b.bscDays++;
    } else if (session_type === "asc") {
      b.asc.enrolled += r.enrolled;
      b.asc.attended += r.attended;
      b.asc.capacity += r.capacity;
      b.asc.casual += r.casual;
      b.ascDays++;
    } else {
      b.vc.enrolled += r.enrolled;
      b.vc.attended += r.attended;
      b.vc.capacity += r.capacity;
      b.vc.casual += r.casual;
      b.vcDays++;
    }
  }

  // Calculate occupancy rates
  const summary = Object.values(buckets).map((b) => ({
    period: b.period,
    bsc: {
      ...b.bsc,
      occupancyRate:
        b.bsc.capacity > 0
          ? Math.round((b.bsc.attended / b.bsc.capacity) * 100)
          : 0,
      days: b.bscDays,
    },
    asc: {
      ...b.asc,
      occupancyRate:
        b.asc.capacity > 0
          ? Math.round((b.asc.attended / b.asc.capacity) * 100)
          : 0,
      days: b.ascDays,
    },
    vc: {
      ...b.vc,
      occupancyRate:
        b.vc.capacity > 0
          ? Math.round((b.vc.attended / b.vc.capacity) * 100)
          : 0,
      days: b.vcDays,
    },
  }));

  // Totals across the whole range
  const totalEnrolled = records.reduce((s, r) => s + r.enrolled, 0);
  const totalAttended = records.reduce((s, r) => s + r.attended, 0);
  const totalCapacity = records.reduce((s, r) => s + r.capacity, 0);
  const overallOccupancy =
    totalCapacity > 0
      ? Math.round((totalAttended / totalCapacity) * 100)
      : 0;

  // Session-type breakdowns
  const bscRecords = records.filter((r) => r.sessionType === "bsc");
  const ascRecords = records.filter((r) => r.sessionType === "asc");

  const bscCapTotal = bscRecords.reduce((s, r) => s + r.capacity, 0);
  const bscAttTotal = bscRecords.reduce((s, r) => s + r.attended, 0);
  const ascCapTotal = ascRecords.reduce((s, r) => s + r.capacity, 0);
  const ascAttTotal = ascRecords.reduce((s, r) => s + r.attended, 0);

  return NextResponse.json({
    summary,
    totals: {
      totalEnrolled,
      totalAttended,
      totalCapacity,
      overallOccupancy,
      bscOccupancy:
        bscCapTotal > 0 ? Math.round((bscAttTotal / bscCapTotal) * 100) : 0,
      ascOccupancy:
        ascCapTotal > 0 ? Math.round((ascAttTotal / ascCapTotal) * 100) : 0,
    },
    range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    recordCount: records.length,
  });
}
