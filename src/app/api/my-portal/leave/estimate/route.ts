/**
 * GET /api/my-portal/leave/estimate?fromDate=&toDate=&leaveCategoryId=
 *
 * Asks EH "how many hours would this leave request consume?" — used by
 * the apply-for-leave form so staff see exactly what they're spending
 * before hitting Submit. EH does the maths based on the employee's
 * configured standard hours + any public-holiday awareness rules.
 *
 * Inexpensive — 1 EH request per call. The form calls this on each
 * meaningful input change (with a debounce on the client).
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  estimateLeaveHours,
  EhPayrollError,
} from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (req, session) => {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Payroll integration not configured" },
      { status: 503 },
    );
  }

  const employeeId = await requireOwnEmployee(session!);

  const url = new URL(req.url);
  const fromDate = url.searchParams.get("fromDate") ?? "";
  const toDate = url.searchParams.get("toDate") ?? "";
  const leaveCategoryIdRaw = url.searchParams.get("leaveCategoryId") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw ApiError.badRequest("fromDate and toDate must be YYYY-MM-DD");
  }
  const leaveCategoryId = Number(leaveCategoryIdRaw);
  if (!Number.isFinite(leaveCategoryId) || leaveCategoryId <= 0) {
    throw ApiError.badRequest("leaveCategoryId must be a positive integer");
  }
  if (fromDate > toDate) {
    throw ApiError.badRequest("From-date must be on or before to-date");
  }

  try {
    const estimate = await estimateLeaveHours(
      employeeId,
      fromDate,
      toDate,
      leaveCategoryId,
    );
    return NextResponse.json(estimate);
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("Leave estimate: EH failure", {
        employeeId,
        status: err.status,
      });
      return NextResponse.json(
        { error: `Could not estimate leave hours (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});
