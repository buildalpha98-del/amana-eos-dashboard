import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/scorecard — get scorecard with measurables and trailing entries
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const scorecard = await prisma.scorecard.findFirst({
    include: {
      measurables: {
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
      },
    },
  });

  if (!scorecard) {
    return NextResponse.json({ error: "No scorecard found" }, { status: 404 });
  }

  return NextResponse.json(scorecard);
}
