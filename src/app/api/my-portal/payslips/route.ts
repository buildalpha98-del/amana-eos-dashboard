/**
 * GET /api/my-portal/payslips
 *
 * Returns the signed-in user's recent payslip summaries (last 12 pay
 * runs by default). Each entry is the *trimmed* shape from
 * `listPayslipsForEmployee` — bank account / super / TFN / YTD details
 * never appear in the response body.
 *
 * Auth: session via `withApiAuth`, employee identity via
 * `requireOwnEmployee` (throws 404 if the User isn't linked to a
 * payroll record yet).
 *
 * Caching: every call hits EH. We could layer a per-employee LRU cache
 * here (60s TTL) but at 100 employees × low concurrency this isn't a
 * rate-limit concern yet. Worth revisiting if My Portal becomes chatty.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { isConfigured, listPayslipsForEmployee, EhPayrollError } from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (_req, session) => {
  if (!isConfigured()) {
    // 503 Service Unavailable — the feature is recognised but the
    // integration isn't set up. The UI can show "Payroll integration
    // not configured. Contact your admin." rather than a generic error.
    return NextResponse.json(
      { error: "Payroll integration not configured" },
      { status: 503 },
    );
  }

  const employeeId = await requireOwnEmployee(session!);

  try {
    const slips = await listPayslipsForEmployee(employeeId, 12);
    return NextResponse.json({ payslips: slips });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("My Portal payslips: EH failure", {
        employeeId,
        status: err.status,
      });
      return NextResponse.json(
        { error: `Could not fetch payslips (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});
