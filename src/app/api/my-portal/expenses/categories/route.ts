/**
 * GET /api/my-portal/expenses/categories
 *
 * Returns the business-level list of expense categories for the
 * submit-expense form dropdown. As of 2026-06-01 Amana has 5 categories
 * configured (Expense Reimbursement, Apprentice training fees, etc.) —
 * dynamic list so new categories added in EH show up without a deploy.
 *
 * Available to any signed-in user. Categories are configuration, not PII.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  listExpenseCategories,
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
    const categories = await listExpenseCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("Expense categories: EH failure", { status: err.status });
      return NextResponse.json(
        { error: `Could not fetch expense categories (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});
