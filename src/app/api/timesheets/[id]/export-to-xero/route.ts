import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";

// POST /api/timesheets/[id]/export-to-xero — placeholder for Xero export
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner"]);
  if (error) return error;

  // Consume params to satisfy Next.js
  await params;

  return NextResponse.json({
    message: "Xero Payroll export not yet configured",
  });
}
