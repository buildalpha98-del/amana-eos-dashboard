import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * DELETE /api/scenarios/[id] — delete a saved scenario (ownership check)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error || !session) return error;

  const { id } = await params;

  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (scenario.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.scenario.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
