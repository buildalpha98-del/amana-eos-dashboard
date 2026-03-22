import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/leave/balances — get leave balances
export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  // Staff can only see their own balances
  let targetUserId: string;
  if (session!.user.role === "staff") {
    targetUserId = session!.user.id;
  } else {
    targetUserId = userId || "";
  }

  const where: Record<string, unknown> = {};
  if (targetUserId) where.userId = targetUserId;

  const balances = await prisma.leaveBalance.findMany({
    where: where as any,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ userId: "asc" }, { leaveType: "asc" }],
  });

  return NextResponse.json(balances);
});
