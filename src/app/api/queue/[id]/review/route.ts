import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
/**
 * POST /api/queue/[id]/review — mark a CoworkReport as reviewed
 */
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
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
});
