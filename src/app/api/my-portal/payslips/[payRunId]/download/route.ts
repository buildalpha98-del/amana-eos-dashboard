/**
 * GET /api/my-portal/payslips/[payRunId]/download
 *
 * Proxies the EH Payroll payslip PDF for the signed-in user. Always
 * authenticates the requestor against `requireOwnEmployee` BEFORE
 * touching EH — so a hostile or buggy client can't fetch someone
 * else's payslip by guessing pay run IDs.
 *
 * Query params:
 *   ?download=1  → forces a Content-Disposition: attachment header so
 *                  the browser saves the file. Without it, browsers
 *                  render inline (which is what FileViewerModal wants).
 *
 * Caching:
 *   - Always `Cache-Control: private, no-store`. Payslips contain TFN,
 *     bank, super, YTD figures — they MUST NOT sit in a shared CDN
 *     cache, browser disk cache, or anywhere persistent.
 *   - The CDN is told explicitly via `private` + `no-store`. Vercel's
 *     edge will honour this and forward 1:1 to the origin every time.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { fetchPayslipPdf, EhPayrollError, isConfigured } from "@/lib/eh-payroll";
import { requireOwnEmployee } from "@/lib/eh-payroll-auth";
import { ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (req, session, context) => {
  if (!isConfigured()) {
    throw ApiError.badRequest("Payroll integration not configured");
  }

  // Matches the pattern in other dynamic routes (e.g. compliance/[id]).
  const { payRunId: payRunIdRaw } = await context!.params!;
  const payRunId = Number(payRunIdRaw);
  if (!Number.isFinite(payRunId) || payRunId <= 0) {
    throw ApiError.badRequest("Invalid pay run id");
  }

  // Identity gate — throws 404 if unmapped, 403 if deactivated, 401 if
  // session is stale. Never returns another user's employee id.
  const employeeId = await requireOwnEmployee(session!);

  let upstream: Response;
  try {
    upstream = await fetchPayslipPdf(employeeId, payRunId);
  } catch (err) {
    if (err instanceof EhPayrollError) {
      logger.warn("Payslip PDF: EH failure", {
        employeeId,
        payRunId,
        status: err.status,
      });
      // 404 from EH → almost certainly "wrong employee for this pay run"
      // which means someone's trying to access another user's slip (or
      // the mapping is wrong). Surface as 404 so we don't leak which
      // pay runs exist for other employees.
      throw err.status === 404
        ? ApiError.notFound("Payslip not found")
        : ApiError.badRequest(`Payroll service responded ${err.status}`);
    }
    throw err;
  }

  // Determine inline vs attachment from `?download=1` query param.
  const url = new URL(req.url);
  const wantAttachment = url.searchParams.get("download") === "1";
  // Build a friendly filename — `payslip-<payRunId>.pdf`. EH doesn't
  // hand us a filename in headers; baking the pay run id keeps slips
  // distinguishable if a staff member saves multiple.
  const filename = `payslip-${payRunId}.pdf`;
  const disposition = wantAttachment
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  // Stream the PDF body through to the client. We don't read it into a
  // Buffer because (a) it's potentially multi-MB and (b) the body
  // contains TFN/bank — we don't want it sitting in our process memory
  // any longer than the stream takes to pass through.
  // NextResponse (not vanilla Response) is required because withApiAuth
  // types its handler return as Promise<NextResponse>. NextResponse
  // extends Response and supports a streaming ReadableStream body, so
  // the proxy semantics are unchanged.
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
