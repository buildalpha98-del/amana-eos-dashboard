import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
// POST /api/leave/balances/sync — placeholder for Xero Payroll sync
export const POST = withApiAuth(async (req, session) => {
  return NextResponse.json({
    message: "Xero Payroll sync not yet configured",
  });
}, { roles: [...ADMIN_ROLES] });
