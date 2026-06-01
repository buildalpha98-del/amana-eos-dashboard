/**
 * GET /api/compliance/registers/staff/export[?serviceId=X]
 *
 * Streams the Reg 145 / Reg 148 staff register as a CSV download.
 * Format is the row-order an ACECQA authorised officer expects when
 * exercising their Reg 168 inspection power.
 *
 * Filename includes the date so subsequent exports don't overwrite.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { buildStaffRegister, rowsToCsv } from "@/lib/nqf-registers";

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId") ?? undefined;
    const rows = await buildStaffRegister(serviceId);
    const csv = rowsToCsv(rows);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `staff-register-${today}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
