/**
 * GET /api/hq/data-runs — what Cowork has sent lately: its OWNA data runs
 * (per centre) and when each centre's weekly accounts last arrived.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { HQ_ROLES, hqServiceIds } from "@/lib/hq-access";

export const GET = withApiAuth(
  async (_req, session) => {
    const scope = await hqServiceIds(session);
    const where = scope ? { serviceId: { in: scope } } : {};
    const [runs, services, accounts] = await Promise.all([
      prisma.ownaDataRun.findMany({ where, orderBy: { createdAt: "desc" }, take: 40, include: { service: { select: { name: true } } } }),
      prisma.service.findMany({
        where: { status: "active", ...(scope ? { id: { in: scope } } : {}) },
        select: { id: true, name: true, coworkFeedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.serviceWeeklyAccounts.groupBy({ by: ["serviceId"], where, _max: { weekStart: true, updatedAt: true } }),
    ]);
    return NextResponse.json({
      runs: runs.map((r) => ({ ...r, serviceName: r.service.name.replace(/^Amana OSHC\s+/i, "") })),
      centres: services.map((s) => {
        const a = accounts.find((x) => x.serviceId === s.id);
        return {
          serviceId: s.id,
          name: s.name.replace(/^Amana OSHC\s+/i, ""),
          lastOwnaRun: s.coworkFeedAt,
          lastWeekLogged: a?._max.weekStart ?? null,
          accountsUpdatedAt: a?._max.updatedAt ?? null,
        };
      }),
    });
  },
  { roles: HQ_ROLES },
);
