import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope, getStateScope } from "@/lib/service-scope";

// GET /api/scorecard — get scorecard with measurables and trailing entries
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const scope = getServiceScope(session);
  const stateScope = getStateScope(session);

  // Build measurable filter: service scope for staff/member, state scope for State Manager
  const measurableWhere = scope
    ? { serviceId: scope }
    : stateScope
      ? { service: { state: stateScope } }
      : undefined;

  const scorecard = await prisma.scorecard.findFirst({
    include: {
      measurables: {
        where: measurableWhere,
        include: {
          owner: { select: { id: true, name: true, email: true, avatar: true } },
          rock: { select: { id: true, title: true } },
          service: { select: { id: true, name: true } },
          entries: {
            orderBy: { weekOf: "desc" },
            take: 13,
            include: {
              enteredBy: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ ownerId: "asc" }, { title: "asc" }],
      },
    },
  });

  if (!scorecard) {
    return NextResponse.json({ error: "No scorecard found" }, { status: 404 });
  }

  return NextResponse.json(scorecard);
}
