/**
 * GET /api/calls/stats — Call summary statistics for the dashboard cards.
 */

import { serviceDayBounds } from "@/lib/timezone";
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(async () => {
  // Today 00:00 in Australia/Sydney
  const todayStartUtc = serviceDayBounds().start;

  const [todayTotal, awaitingAction, urgentCritical, actionedToday] = await Promise.all([
    prisma.vapiCall.count({
      where: { calledAt: { gte: todayStartUtc } },
    }),
    prisma.vapiCall.count({
      where: { status: "new" },
    }),
    prisma.vapiCall.count({
      where: {
        urgency: { in: ["urgent", "critical"] },
        status: { notIn: ["actioned", "closed"] },
      },
    }),
    prisma.vapiCall.count({
      where: { actionedAt: { gte: todayStartUtc } },
    }),
  ]);

  return NextResponse.json({ todayTotal, awaitingAction, urgentCritical, actionedToday });
});
