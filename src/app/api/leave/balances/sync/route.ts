import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/leave/balances/sync — placeholder for Xero Payroll sync
export const POST = withApiAuth(async (req, session) => {
  return NextResponse.json({
    message: "Xero Payroll sync not yet configured",
  });
}, { roles: ["owner", "head_office", "admin"] });
