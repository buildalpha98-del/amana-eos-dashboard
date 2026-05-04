/**
 * GET /api/roster/cost-projection?serviceId=…&weekStart=YYYY-MM-DD
 *
 * Returns a wage-cost projection for the given service + week:
 *  - hours assigned per user (priced against the contract effective
 *    on each shift's date — supports mid-week rate changes)
 *  - the "primary" payRate (= the most-recent contract that priced
 *    any of the user's shifts this week)
 *  - cost (Σ hours × rate) per user, prorated when the contract
 *    changed mid-week
 *  - totals + an "unpriced" bucket for shifts whose user has no
 *    contract overlapping that date
 *  - `proratedHours` per user: hours that priced at a rate other than
 *    the primary, surfaced so the UI can flag rows that crossed a
 *    rate boundary.
 *
 * Service-scoping: org-wide roles see anything; member can read their
 * own service. We deliberately don't expose payRate cross-service —
 * that's wage-info confidentiality.
 *
 * 2026-05-02: introduced as the fifth Connecteam-style roster
 * deliverable.
 * 2026-05-04: extended to handle mid-week pay-rate proration. The
 * route now loads `active` AND `superseded` contracts so a contract
 * that ended Tuesday + a new contract that started Wednesday both
 * contribute to the same week's projection.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { projectCost, type ContractWindow } from "@/lib/roster-cost";

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
    select: {
      userId: true,
      date: true,
      shiftStart: true,
      shiftEnd: true,
    },
  });

  const userIds = Array.from(
    new Set(shifts.map((s) => s.userId).filter((id): id is string => !!id)),
  );

  // Pull every contract whose window could overlap this week. We
  // include `superseded` so a mid-week rate change is honoured: e.g.
  // the user had contract A active until Tue (now superseded) and
  // contract B starting Wed (active) — both need to price the same
  // week. Drafts and terminated contracts contribute nothing
  // financially, so we leave them out.
  //
  // Filter "any window touching [start, end)":
  //   contract.startDate < end  AND  (endDate IS NULL OR endDate >= start)
  const contracts: ContractWindow[] =
    userIds.length === 0
      ? []
      : (
          await prisma.employmentContract.findMany({
            where: {
              userId: { in: userIds },
              status: { in: ["active", "superseded"] },
              startDate: { lt: end },
              OR: [{ endDate: null }, { endDate: { gte: start } }],
            },
            select: {
              userId: true,
              payRate: true,
              startDate: true,
              endDate: true,
            },
          })
        ).map((c) => ({
          userId: c.userId,
          payRate: c.payRate,
          startDate: c.startDate,
          endDate: c.endDate,
        }));

  const projection = projectCost(shifts, contracts);

  return NextResponse.json(projection);
});
