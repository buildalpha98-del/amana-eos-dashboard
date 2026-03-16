import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * POST /api/queue/[id]/complete — mark a CoworkTodo as completed
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const userId = session!.user.id;

  const todo = await prisma.coworkTodo.findUnique({ where: { id } });
  if (!todo) {
    return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  }

  const updated = await prisma.coworkTodo.update({
    where: { id },
    data: {
      completed: true,
      completedAt: new Date(),
      completedBy: userId,
    },
  });

  return NextResponse.json({ todo: updated });
}
