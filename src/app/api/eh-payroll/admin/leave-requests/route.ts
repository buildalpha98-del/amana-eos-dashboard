/**
 * GET /api/eh-payroll/admin/leave-requests?status=Pending
 *
 * Admin / owner / head_office view of all leave requests across the
 * business, sourced directly from EH (NOT our internal LeaveRequest
 * table). Read-only — actual approvals happen in Employment Hero per
 * the migration decision.
 *
 * Optional `status` query param. EH expects `Pending` / `Approved` /
 * `Rejected` / `Cancelled` exactly.
 *
 * Joins each EH employee back to our `User` row via
 * `employmentHeroEmployeeId` so the UI can deep-link to the staff
 * profile.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  listAllLeaveRequests,
  EhPayrollError,
} from "@/lib/eh-payroll";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const VALID_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export const GET = withApiAuth(
  async (req) => {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "Payroll integration not configured" },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    if (statusParam && !VALID_STATUSES.includes(statusParam as ValidStatus)) {
      throw ApiError.badRequest(
        `Invalid status. Expected one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    let requests;
    try {
      requests = await listAllLeaveRequests(
        (statusParam ?? undefined) as ValidStatus | undefined,
      );
    } catch (err) {
      if (err instanceof EhPayrollError) {
        logger.warn("Admin leave-requests fetch failed", { status: err.status });
        return NextResponse.json(
          { error: `EH responded ${err.status}` },
          { status: 502 },
        );
      }
      throw err;
    }

    // Map each EH employee back to our User where one exists. One
    // query for all of them — much cheaper than per-row joins.
    const ehIds = [...new Set(requests.map((r) => r.employeeId))];
    const users =
      ehIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { employmentHeroEmployeeId: { in: ehIds } },
            select: {
              id: true,
              name: true,
              employmentHeroEmployeeId: true,
              service: { select: { id: true, name: true, code: true } },
            },
          });
    const userByEhId = new Map(
      users.map((u) => [u.employmentHeroEmployeeId!, u]),
    );

    return NextResponse.json({
      requests: requests.map((r) => ({
        ...r,
        dashboardUser: userByEhId.get(r.employeeId) ?? null,
      })),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
