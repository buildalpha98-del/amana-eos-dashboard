/**
 * GET /api/roster/cost-projection?serviceId=…&weekStart=YYYY-MM-DD
 *
 * Returns a wage-cost projection for the given service + week:
 *  - hours assigned per user
 *  - the user's `EmploymentContract.payRate` (most recent active)
 *  - cost (hours × rate) per user
 *  - totals + an "unpriced" bucket for shifts whose user has no
 *    active contract
 *
 * Service-scoping: org-wide roles see anything; member can read their
 * own service. We deliberately don't expose payRate cross-service —
 * that's wage-info confidentiality.
 *
 * 2026-05-02: introduced as the fifth Connecteam-style roster
 * deliverable. Pairs with `RosterCostBadge` in the per-service Weekly
 * Shifts grid.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { projectCost } from "@/lib/roster-cost";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const weekStart = searchParams.get("weekStart");
  if (!serviceId || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw ApiError.badRequest("serviceId and weekStart (YYYY-MM-DD) required");
  }

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;
  if (!isAdminRole(role) && callerServiceId !== serviceId) {
    throw ApiError.forbidden("You can only view cost data for your own service.");
  }

  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const shifts = await prisma.rosterShift.findMany({
    where: { serviceId, date: { gte: start, lt: end } },
    select: { userId: true, shiftStart: true, shiftEnd: true },
  });

  const userIds = Array.from(
    new Set(shifts.map((s) => s.userId).filter((id): id is string => !!id)),
  );

  // Pull the active contract per user. If a user has multiple
  // contracts (e.g. mid-week rate change) we take the most recently
  // started one — the typical OSHC pattern of one stable contract per
  // employee makes this safe; fancier mid-week proration is followup.
  const contracts =
    userIds.length === 0
      ? []
      : await prisma.employmentContract.findMany({
          where: {
            userId: { in: userIds },
            // Only `active` contracts contribute to the projection.
            // `contract_draft` is unsigned, `superseded` and
            // `terminated` are historical.
            status: "active",
          },
          select: { userId: true, payRate: true, startDate: true },
          orderBy: { startDate: "desc" },
        });
  const payRateByUser = new Map<string, number>();
  for (const c of contracts) {
    if (!payRateByUser.has(c.userId)) payRateByUser.set(c.userId, c.payRate);
  }

  const projection = projectCost(shifts, payRateByUser);

  return NextResponse.json(projection);
});
