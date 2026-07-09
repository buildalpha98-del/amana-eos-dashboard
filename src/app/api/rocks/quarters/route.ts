/**
 * GET /api/rocks/quarters
 *
 * Returns the distinct list of quarters that have at least one rock,
 * sorted newest first. Powers the "Archive" dropdown on the Rocks
 * page so we only show quarters with real data — otherwise the list
 * would be an ever-growing rolling window of empty tabs.
 *
 * Respects the same scoping rules as GET /api/rocks: state-manager
 * users only see quarters that have rocks in services in their state;
 * service-scoped users see only quarters with rocks in their service.
 *
 * Response: { quarters: ["Q3-2026", "Q2-2026", "Q1-2026", ...] }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

/**
 * Sort quarters newest first. Format is `Q<n>-<yyyy>` — sort by year
 * descending, then quarter number descending.
 */
function compareQuartersDesc(a: string, b: string): number {
  const [aq, ay] = a.split("-");
  const [bq, by] = b.split("-");
  const ayn = Number(ay);
  const byn = Number(by);
  if (ayn !== byn) return byn - ayn;
  return Number(bq.slice(1)) - Number(aq.slice(1));
}

export const GET = withApiAuth(async (_req, session) => {
  const role = session!.user.role as string;
  const scope =
    role === "member" || role === "marketing"
      ? null
      : getServiceScope(session);
  const stateScope = getStateScope(session);

  const where: Record<string, unknown> = {};
  if (scope) where.serviceId = { in: scope };
  if (stateScope) where.service = { state: stateScope };

  const rows = await prisma.rock.findMany({
    where,
    select: { quarter: true },
    distinct: ["quarter"],
  });

  const quarters = rows
    .map((r) => r.quarter)
    .filter((q): q is string => typeof q === "string" && q.length > 0)
    .sort(compareQuartersDesc);

  return NextResponse.json({ quarters });
});
