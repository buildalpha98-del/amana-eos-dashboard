import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/cowork/reports/automation/[id]
 * Fetch a single report with full relations (for the report viewer)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const report = await prisma.coworkReport.findUnique({
    where: { id },
    include: {
      assignedTo: {
        select: { id: true, name: true, email: true, role: true },
      },
      reviewedBy: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
