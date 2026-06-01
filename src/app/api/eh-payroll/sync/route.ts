/**
 * POST /api/eh-payroll/sync
 *
 * Admin-triggered version of the daily sync cron. Same code path
 * (`runEmployeeSync` in `src/lib/eh-payroll-sync.ts`) but session-
 * auth'd instead of bearer-CRON_SECRET, and no cronlock — sync is
 * idempotent so back-to-back runs are safe.
 *
 * Use case: a new starter was just added to EH and the admin doesn't
 * want to wait until 06:30 UTC tomorrow for the auto-mapping. Click
 * "Run sync now" in /settings/payroll, get an immediate summary.
 *
 * Returns the same SyncSummary shape the cron logs.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { isConfigured, EhPayrollError } from "@/lib/eh-payroll";
import { runEmployeeSync } from "@/lib/eh-payroll-sync";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export const POST = withApiAuth(
  async (_req, session) => {
    if (!isConfigured()) {
      throw ApiError.badRequest("Payroll integration not configured");
    }

    try {
      const summary = await runEmployeeSync();
      logger.info("EH Payroll: admin-triggered sync", {
        actorId: session!.user.id,
        actorEmail: session!.user.email,
        ...summary,
      });
      return NextResponse.json(summary);
    } catch (err) {
      if (err instanceof EhPayrollError) {
        logger.warn("Admin sync: EH unreachable", { status: err.status });
        return NextResponse.json(
          { error: `EH responded ${err.status}` },
          { status: 502 },
        );
      }
      throw err;
    }
  },
  { roles: ["owner", "head_office", "admin"] },
);
