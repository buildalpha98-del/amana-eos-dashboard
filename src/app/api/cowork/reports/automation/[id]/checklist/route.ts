import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * PATCH /api/cowork/reports/automation/[id]/checklist
 * Update action item completion state (called from browser, session auth)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { itemId, completed } = await req.json();

  if (typeof itemId !== "string" || typeof completed !== "boolean") {
    return NextResponse.json(
      { error: "itemId (string) and completed (boolean) are required" },
      { status: 400 }
    );
  }

  const report = await prisma.coworkReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const checklist = (report.checklist as Record<string, boolean>) || {};
  checklist[itemId] = completed;

  await prisma.coworkReport.update({
    where: { id },
    data: { checklist },
  });

  return NextResponse.json({ success: true, checklist });
}
