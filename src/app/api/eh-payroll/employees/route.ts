/**
 * GET /api/eh-payroll/employees
 *
 * Admin-only directory of EH Payroll employees, used by the manual
 * mapping UI in Settings → Team. Returns every Active employee plus
 * their current mapping status (whether they're already linked to a
 * dashboard User and which one).
 *
 * Cached server-side by `listEmployees`'s upstream call — the route
 * itself is a thin join between EH and our User table.
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

    // Pull existing mappings so the UI knows which employees are already
    // claimed and by whom. One-shot join — keep payload small (no email).
    const mapped = await prisma.user.findMany({
      where: { employmentHeroEmployeeId: { not: null } },
      select: { id: true, name: true, employmentHeroEmployeeId: true },
    });
    const userByEhId = new Map(
      mapped.map((u) => [u.employmentHeroEmployeeId!, { id: u.id, name: u.name }]),
    );

    const result = employees
      .filter((e) => e.status === "Active")
      .map((e) => ({
        id: e.id,
        name: `${e.firstName} ${e.surname}`.trim(),
        email: e.email,
        startDate: e.startDate,
        // null = unmapped; { id, name } = already linked to this User.
        mappedUser: userByEhId.get(e.id) ?? null,
      }));

    return NextResponse.json({ employees: result });
  },
  { roles: ["owner", "head_office", "admin"] },
);
