import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import type { Prisma } from "@prisma/client";
import { ambassadorRecordWhere } from "../_lib/scope";
import { WINDOW_DAYS } from "@/lib/ambassadors/constants";

/**
 * GET /api/ambassadors/records — role-scoped list.
 *
 * Filters (query params):
 *   status=logged|director_verified|sm_approved|sent_to_payroll|paid|rejected
 *   conflictsOnly=1      — attribution conflicts awaiting resolution
 *   uncertainOnly=1      — new-child checks a Director must attest
 *   dueSoon=1            — day 28 of the window is within 5 days
 *
 * Child privacy: initials only — the full name never leaves the enrolment
 * permission boundary.
 */

const STATUSES = [
  "logged",
  "director_verified",
  "sm_approved",
  "sent_to_payroll",
  "paid",
  "rejected",
] as const;

export const GET = withApiAuth(
  async (req, session) => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const conflictsOnly = url.searchParams.get("conflictsOnly") === "1";
    const uncertainOnly = url.searchParams.get("uncertainOnly") === "1";
    const dueSoon = url.searchParams.get("dueSoon") === "1";

    const where: Prisma.AmbassadorEnrolmentWhereInput =
      await ambassadorRecordWhere(session);

    if (status && (STATUSES as readonly string[]).includes(status)) {
      where.status = status as (typeof STATUSES)[number];
    }
    if (conflictsOnly) where.attributionConflict = true;
    if (uncertainOnly) where.newChildStatus = "uncertain";
    if (dueSoon) {
      // Day 28 within 5 days: firstAttendanceDate in [today-27, today-22]
      // and still unverified — the Director should chase session counts.
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const windowStartMin = new Date(today);
      windowStartMin.setUTCDate(windowStartMin.getUTCDate() - (WINDOW_DAYS - 1));
      const windowStartMax = new Date(today);
      windowStartMax.setUTCDate(windowStartMax.getUTCDate() - (WINDOW_DAYS - 6));
      where.firstAttendanceDate = { gte: windowStartMin, lte: windowStartMax };
      where.status = "logged";
      where.qualified = false;
    }

    const records = await prisma.ambassadorEnrolment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        childInitials: true,
        serviceId: true,
        service: { select: { name: true, code: true } },
        creditedEducatorId: true,
        creditedEducator: { select: { name: true } },
        namedEducatorText: true,
        refCode: true,
        attributionSource: true,
        attributionConflict: true,
        newChildStatus: true,
        regularSessionsPerWeek: true,
        firstAttendanceDate: true,
        paidSessionsAttended: true,
        tierAmount: true,
        incentiveAmount: true,
        qualified: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ records });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
