import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";

// POST /api/leave/balances/sync — placeholder for Xero Payroll sync
export async function POST() {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  return NextResponse.json({
    message: "Xero Payroll sync not yet configured",
  });
}
