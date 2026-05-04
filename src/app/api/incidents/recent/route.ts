/**
 * GET /api/incidents/recent?limit=10&days=14
 *
 * Top-N recent incidents across the caller's visible services,
 * ranked by leadership relevance: reportable-to-authority first,
 * then severity (serious > reportable > moderate > minor), then
 * most recent. Powers the leadership-dashboard widget that
 * replaces the cross-service `/incidents` triage surface (per the
 * deprecation plan in next-priorities.md Tier 1).
 *
 * Service-scoping mirrors the existing `/api/incidents` GET: admin
 * tier sees everything; head-office state-scopes get filtered by
 * `service.state`; centre-scoped roles only see their own. The
 * client widget is currently mounted on `/leadership` (admin-only)
 * but the route is permissive enough that a per-service variant
 * could reuse it later.
 *
 * 2026-05-04: introduced.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getStateScope } from "@/lib/service-scope";
import { getCentreScope, applyCentreFilter } from "@/lib/centre-scope";
import { pickTopRecentIncidents } from "@/lib/incident-priority";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(90).default(14),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    days: searchParams.get("days") ?? undefined,
  });
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const { limit, days } = parsed.data;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const { serviceIds } = await getCentreScope(session);
  const stateScope = getStateScope(session);

  const where: Record<string, unknown> = {
    deleted: false,
    incidentDate: { gte: since },
  };
  if (serviceIds !== null) {
    applyCentreFilter(where, serviceIds);
  }
  if (stateScope) {
    where.service = { state: stateScope };
  }

  // Pull a generous slice (3× limit) so the priority sort has enough
  // material to pick from without dragging the whole table.
  const fetched = await prisma.incidentRecord.findMany({
    where,
    orderBy: { incidentDate: "desc" },
    take: Math.min(limit * 3, 60),
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  const top = pickTopRecentIncidents(fetched, limit);

  return NextResponse.json({
    incidents: top,
    windowDays: days,
    asOf: new Date().toISOString(),
  });
});
