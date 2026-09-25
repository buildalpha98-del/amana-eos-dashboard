import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

// GET /api/leave/calendar — approved + pending leave for a service in a month
//
// SECURITY (2026-09-04, staff-portal-v2 Chunk 5): gated to `minRole: "admin"`
// — the exact gate its only consumer uses (/leave page's Team Calendar tab
// renders behind `hasMinRole(role, "admin")`: owner / head_office / admin /
// eos). Previously ANY authenticated role (staff, marketing, eos_viewer…)
// could call this with no serviceId and dump org-wide leave PII. serviceId
// stays an optional narrowing filter — every permitted caller is an
// org-wide admin-tier role.
export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    const yearNum = parseInt(year ?? "");
    const monthNum = parseInt(month ?? "");
    if (
      !Number.isInteger(yearNum) ||
      !Number.isInteger(monthNum) ||
      monthNum < 1 ||
      monthNum > 12
    ) {
      return NextResponse.json(
        { error: "year and month are required" },
        { status: 400 }
      );
    }

    // Build date range for the entire month
    const monthStart = new Date(yearNum, monthNum - 1, 1);
    const monthEnd = new Date(yearNum, monthNum, 0); // last day of month

    const where: Prisma.LeaveRequestWhereInput = {
      status: { in: ["leave_approved", "leave_pending"] },
      // Leave overlaps with the month if startDate <= monthEnd AND endDate >= monthStart
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    };

    if (serviceId) where.serviceId = serviceId;

    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "asc" },
    });

    const calendar = requests.map((r) => ({
      userId: r.userId,
      userName: r.user.name,
      leaveType: r.leaveType,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      totalDays: r.totalDays,
    }));

    return NextResponse.json(calendar);
  },
  { minRole: "admin" },
);
