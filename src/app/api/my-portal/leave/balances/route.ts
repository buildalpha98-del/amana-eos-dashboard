/**
 * GET /api/my-portal/leave/balances
 *
 * Returns the signed-in user's current leave balances from Employment
 * Hero Payroll. One row per leave category the employee has accrued
 * any balance against — annual, personal/carer's, long service, etc.
 *
 * EH is the source of truth post-2026-06-01. The internal `LeaveBalance`
 * table + `/api/leave/balances` route still exist for the admin /leave
 * page; future PR will migrate that too.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { isConfigured, getLeaveBalances, EhPayrollError } from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (_req, session) => {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Payroll integration not configured" },
      { status: 503 },
    );
  }

  const employeeId = await requireOwnEmployee(session!);

  try {
    const balances = await getLeaveBalances(employeeId);
    return NextResponse.json({ balances });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("My Portal leave balances: EH failure", {
        employeeId,
        status: err.status,
      });
      return NextResponse.json(
        { error: `Could not fetch leave balances (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});
