/**
 * GET /api/materials?roundId= — materials order rounds, and the chosen
 * round's centre summary (the spreadsheet's Centres sheet). Latest round
 * by default.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { roundSummary } from "@/lib/materials-orders";
import { MATERIALS_ROLES, materialsScope } from "@/lib/materials-access";

export const GET = withApiAuth(
  async (req, session) => {
    const scope = materialsScope(session as never);
    const rounds = await prisma.materialsOrderRound.findMany({
      orderBy: [{ programStart: "desc" }, { createdAt: "desc" }],
      select: { id: true, key: true, title: true, term: true, programStart: true, programEnd: true, repliesDueAt: true, status: true, notes: true },
      take: 30,
    });
    const wanted = new URL(req.url).searchParams.get("roundId");
    const round = rounds.find((r) => r.id === wanted) ?? rounds[0] ?? null;
    return NextResponse.json({
      rounds,
      round,
      centres: round ? await roundSummary(round.id, scope) : [],
      canOrder: scope === null,
    });
  },
  { roles: [...MATERIALS_ROLES] },
);
