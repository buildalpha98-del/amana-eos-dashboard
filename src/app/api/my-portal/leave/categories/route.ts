/**
 * GET /api/my-portal/leave/categories
 *
 * Returns the business-level list of leave categories the apply-for-
 * leave form can target. Annual, Personal/Carer's, Long Service, etc.
 * Public read for any signed-in user (the values are config, not PII)
 * but we still go through `withApiAuth` so we don't open an
 * unauthenticated surface.
 *
 * Categories are very stable; staff portal can cache 5+ minutes.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  listLeaveCategories,
  EhPayrollError,
} from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async () => {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Payroll integration not configured" },
      { status: 503 },
    );
  }

  try {
    const categories = await listLeaveCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("Leave categories: EH failure", { status: err.status });
      return NextResponse.json(
        { error: `Could not fetch leave categories (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});
