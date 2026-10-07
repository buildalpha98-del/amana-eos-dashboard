/**
 * PUT /api/my-portal/payroll/super — choose the super fund the signed-in
 * staff member is paid into. Written straight to Employment Hero (their
 * main fund); nothing stored here. Audited.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { EhPayrollError, isConfigured, saveMainSuperFund } from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { superFundInputSchema, summariseSuperFund } from "@/lib/payroll-details";
import { logAuditEvent } from "@/lib/audit-log";

export const PUT = withApiAuth(
  async (req, session) => {
    if (!isConfigured()) throw new ApiError(503, "Payroll isn't connected yet");
    const employeeId = await requireOwnEmployee(session!);

    const parsed = superFundInputSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

    let saved;
    try {
      saved = await saveMainSuperFund(employeeId, parsed.data);
    } catch (err) {
      if (err instanceof EhPayrollError && err.status >= 400 && err.status < 500) {
        throw ApiError.badRequest("Employment Hero didn't accept that fund — check your member number.");
      }
      throw err;
    }

    logAuditEvent(
      {
        action: "payroll.super_fund_changed",
        actorId: session!.user.id,
        actorEmail: session!.user.email,
        targetId: session!.user.id,
        targetType: "User",
        metadata: { ehEmployeeId: employeeId, fund: parsed.data.fundName },
      },
      req,
    );

    return NextResponse.json({ fund: summariseSuperFund(saved.fund), warning: saved.warning });
  },
  { rateLimit: { max: 5, windowMs: 15 * 60 * 1000 } },
);
