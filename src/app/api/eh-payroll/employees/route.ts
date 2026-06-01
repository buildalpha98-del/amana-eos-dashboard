/**
 * GET /api/eh-payroll/employees
 *
 * Admin payload powering the /settings/payroll mapping UI. Returns
 * both sides of the join in one trip so the client doesn't have to
 * stitch:
 *   - `employees`: every Active EH employee with their current
 *     mapping state (null if unlinked)
 *   - `unmappedDashboardUsers`: active dashboard users with no
 *     `employmentHeroEmployeeId` — the "needs attention" list
 *
 * Cached server-side by listEmployees's call to EH; cheap to call.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { isConfigured, listEmployees, EhPayrollError } from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(
  async () => {
    if (!isConfigured()) {
      return NextResponse.json({ error: "EH Payroll not configured" }, { status: 503 });
    }

    let employees;
    try {
      employees = await listEmployees();
    } catch (err) {
      if (err instanceof EhPayrollError) {
        logger.warn("EH employees fetch failed", { status: err.status });
        return NextResponse.json(
          { error: `EH responded ${err.status}` },
          { status: 502 },
        );
      }
      throw err;
    }

    // Join with the User table in one query: mapped users for the
    // table rows + unmapped active users for the "needs attention"
    // section. Pull employmentHeroEmployeeId so we can compute both
    // from a single result set.
    const allActiveUsers = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        employmentHeroEmployeeId: true,
      },
      orderBy: { name: "asc" },
    });

    const userByEhId = new Map(
      allActiveUsers
        .filter((u) => u.employmentHeroEmployeeId !== null)
        .map((u) => [u.employmentHeroEmployeeId!, { id: u.id, name: u.name }]),
    );

    const employeesPayload = employees
      .filter((e) => e.status === "Active")
      .map((e) => ({
        id: e.id,
        name: `${e.firstName} ${e.surname}`.trim(),
        email: e.email,
        startDate: e.startDate,
        mappedUser: userByEhId.get(e.id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const unmappedDashboardUsers = allActiveUsers
      .filter((u) => u.employmentHeroEmployeeId === null)
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));

    return NextResponse.json({
      employees: employeesPayload,
      unmappedDashboardUsers,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
