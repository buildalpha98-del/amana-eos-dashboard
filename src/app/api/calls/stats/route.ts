/**
 * GET /api/calls/stats — Call summary statistics for the dashboard cards.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export const GET = withApiAuth(async () => {
  // Today 00:00 in Australia/Sydney
  const now = new Date();
  const sydneyOffset = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }),
  );
  const todayStart = new Date(sydneyOffset);
  todayStart.setHours(0, 0, 0, 0);
  // Convert back to UTC for the DB query
  const diffMs = sydneyOffset.getTime() - now.getTime();
  const todayStartUtc = new Date(todayStart.getTime() - diffMs);

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
