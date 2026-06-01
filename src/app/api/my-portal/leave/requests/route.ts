/**
 * GET  /api/my-portal/leave/requests — own user's recent leave requests
 * POST /api/my-portal/leave/requests — submit a new leave request
 *
 * Both are gated by `requireOwnEmployee` — every request acts only on
 * the signed-in user's EH employee record. Manager / admin approval
 * still happens in EH; we don't approve from here.
 *
 * POST body (validated):
 *   - fromDate, toDate: YYYY-MM-DD
 *   - hours: positive number
 *   - leaveCategoryId: number (must match one from /categories)
 *   - notes: optional, max 1000 chars
 *
 * 201 on success with the created EH request body. EH sets status to
 * "Pending" by default (we hardcode automaticallyApprove=false in the
 * client) so the request is always queued for manager approval.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import {
  isConfigured,
  listLeaveRequests,
  createLeaveRequest,
  EhPayrollError,
} from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
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
    const requests = await listLeaveRequests(employeeId, 20);
    return NextResponse.json({ requests });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("My Portal leave requests list: EH failure", {
        employeeId,
        status: err.status,
      });
      return NextResponse.json(
        { error: `Could not fetch leave requests (EH ${err.status})` },
        { status: 502 },
      );
    }
    throw err;
  }
});

const submitSchema = z.object({
  // YYYY-MM-DD only — EH normalises ISO datetimes but our form sends
  // raw <input type="date"> values which are always YYYY-MM-DD.
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid fromDate"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid toDate"),
  hours: z.number().positive().max(1000),
  leaveCategoryId: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
});

export const POST = withApiAuth(async (req, session) => {
  if (!isConfigured()) {
    throw ApiError.badRequest("Payroll integration not configured");
  }

  const employeeId = await requireOwnEmployee(session!);

  const raw = await parseJsonBody(req);
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }
  // Sanity: from <= to. EH would also reject, but a friendly 400 here is
  // a faster error path than a 502 with EH's terse response.
  if (parsed.data.fromDate > parsed.data.toDate) {
    throw ApiError.badRequest("From-date must be on or before to-date");
  }

  try {
    const created = await createLeaveRequest(employeeId, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("My Portal leave submit: EH rejected", {
        employeeId,
        status: err.status,
        body: err.body,
      });
      // 4xx from EH usually = bad inputs (overlapping leave, insufficient
      // balance, invalid category). Surface as 400 with EH's message body
      // when it's a recognisable string, otherwise a generic message.
      if (err.status >= 400 && err.status < 500) {
        const msg =
          typeof err.body === "string"
            ? err.body
            : `Payroll rejected this leave request (EH ${err.status}). Check dates and category.`;
        throw ApiError.badRequest(msg);
      }
      throw new ApiError(502, `Payroll service responded ${err.status}`);
    }
    throw err;
  }
});
