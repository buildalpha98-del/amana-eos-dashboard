/**
 * GET /api/financials/centres?period=this_week|last_week|this_month|last_month
 * — Financials → Centre breakdown (src/lib/centre-breakdown.ts). Admin tier;
 * a state-scoped State Manager sees their state's centres.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { getStateScope } from "@/lib/service-scope";
import { centreBreakdown, type BreakdownPeriod } from "@/lib/centre-breakdown";

const PERIODS: BreakdownPeriod[] = ["this_week", "last_week", "this_month", "last_month"];

export const GET = withApiAuth(
  async (req, session) => {
    const p = new URL(req.url).searchParams.get("period") as BreakdownPeriod | null;
    const period = p && PERIODS.includes(p) ? p : "this_month";
    const state = getStateScope(session);
    const ids = state
      ? (await prisma.service.findMany({ where: { state }, select: { id: true } })).map((s) => s.id)
      : null;
    return NextResponse.json(await centreBreakdown(period, ids));
  },
  { roles: [...ADMIN_ROLES] },
);
