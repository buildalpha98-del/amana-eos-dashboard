import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/timesheets/[id]/export-to-xero — placeholder for Xero export
export const POST = withApiAuth(async (req, session, context) => {
  // Consume params to satisfy Next.js
  await context!.params!;

  return NextResponse.json({
    message: "Xero Payroll export not yet configured",
  });
}, { roles: ["owner"] });
