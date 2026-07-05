/**
 * GET  /api/me/briefing — today's morning brief for the session user
 *                         (null when the cron hasn't produced one yet).
 * PATCH /api/me/briefing — mark today's brief as read.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

function todayUtcStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const GET = withApiAuth(async (_req, session) => {
  const briefing = await prisma.dailyBriefing.findUnique({
    where: {
      userId_date: { userId: session.user.id, date: todayUtcStart() },
    },
    select: {
      id: true,
      date: true,
      content: true,
      signals: true,
      source: true,
      readAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ briefing });
});

export const PATCH = withApiAuth(async (_req, session) => {
  const updated = await prisma.dailyBriefing.updateMany({
    where: {
      userId: session.user.id,
      date: todayUtcStart(),
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ marked: updated.count });
});
