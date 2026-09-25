import { NextResponse } from "next/server";
import type { RampStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";
import { loadRampScorecard } from "@/lib/ramp/scorecard";

/**
 * GET /api/ramps — every open (active/extended) 90-day ramp, with its live
 * scorecard summary. Admin tier sees the network; a coordinator (member)
 * sees their own service only. Closed ramps are available via
 * `?status=completed|ended`.
 */
export const GET = withApiAuth(async (req, session) => {
  const role = session!.user.role ?? null;
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status: RampStatus[] =
    statusParam === "completed" || statusParam === "ended"
      ? [statusParam]
      : ["active", "extended"];

  let serviceFilter: { serviceId: string } | undefined;
  if (!isAdminRole(role)) {
    const viewer = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { serviceId: true },
    });
    if (!viewer?.serviceId) return NextResponse.json({ ramps: [] });
    serviceFilter = { serviceId: viewer.serviceId };
  }

  const ramps = await prisma.staffRamp.findMany({
    where: { status: { in: status }, user: { active: true, ...(serviceFilter ?? {}) } },
    include: {
      user: { select: { id: true, name: true, avatar: true, service: { select: { id: true, name: true } } } },
      checkIns: true,
      checkpoints: true,
    },
    orderBy: { startDate: "asc" },
  });

  const now = new Date();
  const rows = await Promise.all(
    ramps.map(async (ramp) => {
      const scorecard = await loadRampScorecard(prisma, ramp, now);
      const nextCheckIn = ramp.checkIns
        .filter((c) => !c.submittedAt && !c.skipped)
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
      const nextCheckpoint = ramp.checkpoints
        .filter((c) => !c.submittedAt)
        .sort((a, b) => a.day - b.day)[0];
      return {
        id: ramp.id,
        status: ramp.status,
        startDate: ramp.startDate,
        endDate: ramp.endDate,
        user: ramp.user,
        day: scorecard.day,
        overall: scorecard.overall,
        lastMood: scorecard.lastMood,
        recentFlags: scorecard.recentFlags,
        behind: scorecard.rows.filter((r) => r.status === "behind").length,
        nextCheckIn: nextCheckIn ? { weekNumber: nextCheckIn.weekNumber, dueAt: nextCheckIn.dueAt } : null,
        nextCheckpoint: nextCheckpoint
          ? { day: nextCheckpoint.day, dueAt: nextCheckpoint.dueAt, overdue: nextCheckpoint.dueAt < now }
          : null,
      };
    }),
  );

  return NextResponse.json({ ramps: rows });
});
