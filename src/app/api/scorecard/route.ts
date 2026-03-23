import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

// GET /api/scorecard — get scorecard with measurables and trailing entries
export const GET = withApiAuth(async (req, session) => {
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
        orderBy: [{ sortOrder: "asc" }, { ownerId: "asc" }, { title: "asc" }],
      },
    },
  });

  if (!scorecard) {
    return NextResponse.json({ error: "No scorecard found" }, { status: 404 });
  }

  return NextResponse.json(scorecard);
});
