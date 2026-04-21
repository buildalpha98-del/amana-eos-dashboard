import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/communication/pulse/admin-summary?weekOf=ISO
 *
 * Admin-tier anonymous pulse summary: sentiment counts + blocker count,
 * org-wide and per-service. NEVER exposes individual staff names, emails,
 * or userIds — this is an explicit anonymity guarantee backed by a unit test.
 *
 * Sentiment buckets:
 *   positive   → mood in {4, 5}
 *   neutral    → mood === 3
 *   concerning → mood in {1, 2}
 *   submitted without mood → counted only in `submitted`
 *
 * Use /api/communication/pulse/summary for the leader-tier view with names.
 */
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const weekOfRaw = searchParams.get("weekOf");
  if (!weekOfRaw) {
    return NextResponse.json({ error: "weekOf query parameter is required" }, { status: 400 });
  }
  const weekOf = new Date(weekOfRaw);
  if (Number.isNaN(weekOf.getTime())) {
    return NextResponse.json({ error: "weekOf is not a valid date" }, { status: 400 });
  }

  const [services, pulses, totalUsers, perServiceUserCounts] = await Promise.all([
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.weeklyPulse.findMany({
      where: { weekOf, submittedAt: { not: null } },
      select: {
        id: true,
        mood: true,
        blockers: true,
        user: { select: { serviceId: true } },
      },
    }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.groupBy({
      by: ["serviceId"],
      where: { active: true, serviceId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  function bucket(mood: number | null) {
    if (mood == null) return "unknown" as const;
    if (mood >= 4) return "positive" as const;
    if (mood === 3) return "neutral" as const;
    return "concerning" as const;
  }

  function aggregate(subset: typeof pulses) {
    let positive = 0, neutral = 0, concerning = 0, blockerCount = 0;
    for (const p of subset) {
      const b = bucket(p.mood);
      if (b === "positive") positive += 1;
      else if (b === "neutral") neutral += 1;
      else if (b === "concerning") concerning += 1;
      if (p.blockers && p.blockers.trim().length > 0) blockerCount += 1;
    }
    return { submitted: subset.length, positive, neutral, concerning, blockerCount };
  }

  const orgAgg = aggregate(pulses);
  const byService = services.map((s) => {
    const subset = pulses.filter((p) => p.user?.serviceId === s.id);
    const userCount = perServiceUserCounts.find((g) => g.serviceId === s.id)?._count._all ?? 0;
    const agg = aggregate(subset);
    return {
      serviceId: s.id,
      serviceName: s.name,
      serviceCode: s.code,
      totalUsers: userCount,
      ...agg,
    };
  });

  return NextResponse.json({
    weekOf: weekOf.toISOString(),
    org: {
      totalUsers,
      ...orgAgg,
    },
    byService,
  });
}, { roles: [...ADMIN_ROLES] });
