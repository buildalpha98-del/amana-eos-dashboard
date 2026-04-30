import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/parent/children/[id]/medications
 *
 * Parent read-only feed of recent doses for this child (last 30).
 */
export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");

  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !ctx.parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const doses = await prisma.medicationAdministration.findMany({
    where: { childId },
    orderBy: { administeredAt: "desc" },
    take: 30,
    select: {
      id: true,
      medicationName: true,
      dose: true,
      route: true,
      administeredAt: true,
      notes: true,
      administeredBy: { select: { name: true } },
      witnessedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ items: doses });
});
