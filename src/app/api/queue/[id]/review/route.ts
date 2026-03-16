import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * POST /api/queue/[id]/review — mark a CoworkReport as reviewed
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const userId = session!.user.id;

  const report = await prisma.coworkReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const updated = await prisma.coworkReport.update({
    where: { id },
    data: {
      status: "reviewed",
      reviewedAt: new Date(),
      reviewedById: userId,
    },
  });

  return NextResponse.json({ report: updated });
}
