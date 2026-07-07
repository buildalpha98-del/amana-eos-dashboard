import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";
import { MTOP_OUTCOMES } from "@/lib/schemas/staff-reflection";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

const EXCERPT_LEN = 300;

function excerpt(text: string): string {
  return text.length > EXCERPT_LEN ? `${text.slice(0, EXCERPT_LEN - 1)}…` : text;
}

/**
 * GET /api/services/[id]/qip-evidence?qa=&mtop=&from=&to=&limit=
 *
 * Evidence browser behind the QIP tab: every reflection/observation excerpt
 * matching an NQS quality area or MTOP outcome tag. Tags ARE the evidence
 * ledger — this is a pure query over existing content.
 *
 * Observations carry no QA tags, so a qa filter without an mtop filter
 * returns reflections only.
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const qaParam = url.searchParams.get("qa");
  const mtop = url.searchParams.get("mtop") ?? undefined;
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const limit = safeLimit(url.searchParams.get("limit"), 50, 100);

  const qa = qaParam ? Number(qaParam) : undefined;
  if (qaParam && (!Number.isInteger(qa) || qa! < 1 || qa! > 7)) {
    throw ApiError.badRequest("qa must be an integer 1-7");
  }
  if (mtop && !(MTOP_OUTCOMES as readonly string[]).includes(mtop)) {
    throw ApiError.badRequest(`mtop must be one of: ${MTOP_OUTCOMES.join(", ")}`);
  }

  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    throw ApiError.badRequest("from/to must be valid dates");
  }
  const createdAt =
    from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

  const reflections = await prisma.staffReflection.findMany({
    where: {
      serviceId: id,
      ...(createdAt ? { createdAt } : {}),
      ...(qa ? { qualityAreas: { has: qa } } : {}),
      ...(mtop ? { mtopOutcomes: { has: mtop } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { author: { select: { id: true, name: true, avatar: true } } },
  });

  // Observations have MTOP tags only. A qa-only filter can't match them.
  const includeObservations = !qa || Boolean(mtop);
  const observations = includeObservations
    ? await prisma.learningObservation.findMany({
        where: {
          serviceId: id,
          ...(createdAt ? { createdAt } : {}),
          ...(mtop ? { mtopOutcomes: { has: mtop } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { author: { select: { id: true, name: true, avatar: true } } },
      })
    : [];

  const items = [
    ...reflections.map((r) => ({
      kind: "reflection" as const,
      id: r.id,
      title: r.title,
      excerpt: excerpt(r.content),
      qualityAreas: r.qualityAreas,
      mtopOutcomes: r.mtopOutcomes,
      aiTagged: r.aiTagged,
      author: r.author,
      createdAt: r.createdAt,
    })),
    ...observations.map((o) => ({
      kind: "observation" as const,
      id: o.id,
      title: o.title,
      excerpt: excerpt(o.narrative),
      qualityAreas: [] as number[],
      mtopOutcomes: o.mtopOutcomes,
      aiTagged: o.aiTagged,
      author: o.author,
      childId: o.childId,
      createdAt: o.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return NextResponse.json({ items });
});
