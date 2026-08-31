/**
 * GET /api/induction/readiness — the caller's induction readiness (or a target
 * user's, for admins via ?userId=). Returns status, blockers, and practical
 * checklist completion so the learner hub and admin pipeline can render.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getInductionReadiness } from "@/lib/induction";
import { isAdminRole } from "@/lib/role-permissions";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("userId");
  const isAdmin = isAdminRole(session!.user.role as string);
  const userId = isAdmin && requested ? requested : session!.user.id;

  const [readiness, user, items, signoffs] = await Promise.all([
    getInductionReadiness(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        inductionStatus: true,
        inductionDueDate: true,
        inductionGraceUntil: true,
        inductionClearedAt: true,
      },
    }),
    prisma.practicalChecklistItem.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.practicalSignoff.findMany({
      where: { userId },
      select: { itemId: true, signedAt: true, signedBy: { select: { name: true } } },
    }),
  ]);

  const signedByItem = new Map(signoffs.map((s) => [s.itemId, s]));
  const practical = items.map((it) => ({
    id: it.id,
    title: it.title,
    description: it.description,
    signed: signedByItem.has(it.id),
    signedBy: signedByItem.get(it.id)?.signedBy?.name ?? null,
  }));

  return NextResponse.json({
    userId,
    status: user?.inductionStatus ?? "cleared",
    dueDate: user?.inductionDueDate ?? null,
    graceUntil: user?.inductionGraceUntil ?? null,
    clearedAt: user?.inductionClearedAt ?? null,
    ready: readiness.ready,
    blockers: readiness.blockers,
    practical,
    practicalAllSigned: practical.length > 0 && practical.every((p) => p.signed),
  });
});
