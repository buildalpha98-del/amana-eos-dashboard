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
 * Response: { quarters: ["Q1-FY27", "Q4-FY26", "Q3-FY26", ...] }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compareQuartersDesc } from "@/lib/utils";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

// 2026-07-28: sorting moved to the shared comparator in @/lib/utils.
// The local version did Number("2026") on the year half, which yields NaN
// against the FY format ("Q1-FY27") and silently scrambled the ordering.

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
