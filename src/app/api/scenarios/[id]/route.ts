import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
/**
 * DELETE /api/scenarios/[id] — delete a saved scenario (ownership check)
 */
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (scenario.createdById !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.scenario.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
});
