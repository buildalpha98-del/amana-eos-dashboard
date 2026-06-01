/**
 * GET /api/eh-payroll/status
 *
 * Reports the health of the Employment Hero Payroll integration for the
 * settings page. Returns:
 *   - configured: env vars present
 *   - connected:  API key actually works (round-trip to /api/v2/business)
 *   - business:   { id, name } we're pointed at
 *   - mapping:    { totalEmployees, mappedUsers, unmappedUsers }
 *
 * Admin-only. Hits EH on every call (no caching) — this is the "test
 * connection" button's data source, freshness matters more than load.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  getOwnBusiness,
  listEmployees,
  EhPayrollError,
} from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(
  async () => {
    if (!isConfigured()) {
      return NextResponse.json({
        configured: false,
        connected: false,
        business: null,
        mapping: null,
        error: "EH_PAYROLL_API_KEY or EH_PAYROLL_BUSINESS_ID not set",
      });
    }

    let business = null as Awaited<ReturnType<typeof getOwnBusiness>> | null;
    let connectError: string | null = null;
    try {
      business = await getOwnBusiness();
    } catch (err) {
      connectError =
        err instanceof EhPayrollError
          ? `EH responded ${err.status}`
          : err instanceof Error
            ? err.message
            : "Unknown error";
      logger.warn("EH Payroll status: connection failed", { error: connectError });
    }

    // Mapping counts — even if EH is down we can still report what we
    // know about our own User table, so the settings card stays useful.
    const mappedCount = await prisma.user.count({
      where: { active: true, employmentHeroEmployeeId: { not: null } },
    });
    const totalActive = await prisma.user.count({ where: { active: true } });

    // If EH is reachable we can compare against the real headcount on
    // their side. If not, fall back to "?" so the UI doesn't lie.
    let ehHeadcount: number | null = null;
    if (business && !connectError) {
      try {
        const employees = await listEmployees();
        ehHeadcount = employees.filter((e) => e.status === "Active").length;
      } catch (err) {
        logger.warn("EH Payroll status: employee count failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      configured: true,
      connected: !!business && !connectError,
      business,
      mapping: {
        ehHeadcount,
        mappedUsers: mappedCount,
        totalDashboardUsers: totalActive,
        unmappedUsers: totalActive - mappedCount,
      },
      error: connectError,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
