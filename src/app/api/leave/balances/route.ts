import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/leave/balances — get leave balances
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

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
}
