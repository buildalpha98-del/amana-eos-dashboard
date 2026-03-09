import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/services/[id]/budget — budget summary with grocery calc + equipment totals
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const url = new URL(req.url);

  // Default range: current Australian FY (Jul 1 – today)
  const now = new Date();
  const fyStartMonth = 6; // July = index 6
  const fyYear = now.getMonth() >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  const defaultFrom = new Date(fyYear, fyStartMonth, 1);

  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : defaultFrom;
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : now;
  const period = url.searchParams.get("period") || "monthly";

  // Fetch service grocery rates
  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      bscGroceryRate: true,
      ascGroceryRate: true,
      vcGroceryRate: true,
    },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Aggregate attendance by session type
  const attendanceAgg = await prisma.dailyAttendance.groupBy({
    by: ["sessionType"],
    where: {
      serviceId: id,
      date: { gte: from, lte: to },
    },
    _sum: { attended: true },
  });

  const attendanceMap: Record<string, number> = { bsc: 0, asc: 0, vc: 0 };
  for (const a of attendanceAgg) {
    attendanceMap[a.sessionType] = a._sum.attended || 0;
  }

  const bscCost = attendanceMap.bsc * service.bscGroceryRate;
  const ascCost = attendanceMap.asc * service.ascGroceryRate;
  const vcCost = attendanceMap.vc * service.vcGroceryRate;
  const groceryTotal = bscCost + ascCost + vcCost;

  // Aggregate equipment items by category
  const equipmentItems = await prisma.budgetItem.findMany({
    where: {
      serviceId: id,
      date: { gte: from, lte: to },
    },
  });

  const equipmentTotal = equipmentItems.reduce((sum, i) => sum + i.amount, 0);

  const categoryMap: Record<string, { total: number; count: number }> = {};
  for (const item of equipmentItems) {
    if (!categoryMap[item.category]) {
      categoryMap[item.category] = { total: 0, count: 0 };
    }
    categoryMap[item.category].total += item.amount;
    categoryMap[item.category].count += 1;
  }
  const byCategory = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    ...data,
  }));

  // Build period buckets
  const periods = buildPeriodBuckets(
    from,
    to,
    period,
    id,
    equipmentItems,
    service
  );

  // We need attendance per period too — query all daily records
  const dailyRecords = await prisma.dailyAttendance.findMany({
    where: {
      serviceId: id,
      date: { gte: from, lte: to },
    },
    select: { date: true, sessionType: true, attended: true },
  });

  // Fill attendance into period buckets
  for (const rec of dailyRecords) {
    const bucketKey = getBucketKey(rec.date, period);
    const bucket = periods.find((p) => p.period === bucketKey);
    if (bucket) {
      if (rec.sessionType === "bsc") {
        bucket.bscAttendance += rec.attended;
        bucket.groceryCost += rec.attended * service.bscGroceryRate;
      } else if (rec.sessionType === "asc") {
        bucket.ascAttendance += rec.attended;
        bucket.groceryCost += rec.attended * service.ascGroceryRate;
      } else if (rec.sessionType === "vc") {
        bucket.vcAttendance += rec.attended;
        bucket.groceryCost += rec.attended * service.vcGroceryRate;
      }
      bucket.total = bucket.groceryCost + bucket.equipmentCost;
    }
  }

  return NextResponse.json({
    groceryBudget: {
      total: groceryTotal,
      bsc: { attended: attendanceMap.bsc, rate: service.bscGroceryRate, cost: bscCost },
      asc: { attended: attendanceMap.asc, rate: service.ascGroceryRate, cost: ascCost },
      vc: { attended: attendanceMap.vc, rate: service.vcGroceryRate, cost: vcCost },
    },
    equipmentBudget: {
      total: equipmentTotal,
      byCategory,
    },
    combinedTotal: groceryTotal + equipmentTotal,
    periods: periods.sort((a, b) => a.period.localeCompare(b.period)),
    range: { from: from.toISOString(), to: to.toISOString() },
    rates: {
      bsc: service.bscGroceryRate,
      asc: service.ascGroceryRate,
      vc: service.vcGroceryRate,
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────

function getBucketKey(date: Date, period: string): string {
  const d = new Date(date);
  if (period === "weekly") {
    // ISO week: find Monday
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const yr = monday.getFullYear();
    const oneJan = new Date(yr, 0, 1);
    const weekNum = Math.ceil(
      ((monday.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7
    );
    return `${yr}-W${String(weekNum).padStart(2, "0")}`;
  }
  // monthly
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface PeriodBucket {
  period: string;
  groceryCost: number;
  equipmentCost: number;
  total: number;
  bscAttendance: number;
  ascAttendance: number;
  vcAttendance: number;
}

function buildPeriodBuckets(
  from: Date,
  to: Date,
  period: string,
  _serviceId: string,
  equipmentItems: { date: Date; amount: number }[],
  _service: { bscGroceryRate: number; ascGroceryRate: number; vcGroceryRate: number }
): PeriodBucket[] {
  const buckets: Map<string, PeriodBucket> = new Map();

  // Generate all bucket keys in range
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = getBucketKey(cursor, period);
    if (!buckets.has(key)) {
      buckets.set(key, {
        period: key,
        groceryCost: 0,
        equipmentCost: 0,
        total: 0,
        bscAttendance: 0,
        ascAttendance: 0,
        vcAttendance: 0,
      });
    }
    if (period === "weekly") {
      cursor.setDate(cursor.getDate() + 7);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Fill equipment costs into buckets
  for (const item of equipmentItems) {
    const key = getBucketKey(item.date, period);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.equipmentCost += item.amount;
    }
  }

  return Array.from(buckets.values());
}
