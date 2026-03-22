import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/services/[id]/scorecard — get measurables for a service with trailing entries
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const measurables = await prisma.measurable.findMany({
    where: { serviceId: id },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      rock: { select: { id: true, title: true } },
      entries: {
        orderBy: { weekOf: "desc" },
        take: 13,
        include: {
          enteredBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ ownerId: "asc" }, { title: "asc" }],
  });

  return NextResponse.json(measurables);
});
