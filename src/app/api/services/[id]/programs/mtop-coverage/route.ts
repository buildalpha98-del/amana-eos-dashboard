import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const MTOP_LABELS: Record<number, string> = {
  1: "Identity",
  2: "Connected",
  3: "Wellbeing",
  4: "Confident Learner",
  5: "Communicator",
};

// GET /api/services/[id]/programs/mtop-coverage?weekStart=YYYY-MM-DD
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const url = new URL(req.url);
  const weekStartParam = url.searchParams.get("weekStart");

  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam);
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    weekStart = new Date(now);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
  }

  const activities = await prisma.programActivity.findMany({
    where: { serviceId: id, weekStart },
    select: { id: true, mtopOutcomes: true, title: true },
  });

  const totalActivities = activities.length;

  // Count how many activities link to each outcome
  const outcomeCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of activities) {
    for (const o of a.mtopOutcomes) {
      if (o >= 1 && o <= 5) outcomeCounts[o]++;
    }
  }

  const coverage = Object.entries(outcomeCounts).map(([outcome, count]) => ({
    outcome: Number(outcome),
    label: MTOP_LABELS[Number(outcome)],
    count,
    percentage: totalActivities > 0 ? Math.round((count / totalActivities) * 100) : 0,
  }));

  // Untagged activities (no MTOP outcomes assigned)
  const untagged = activities.filter((a) => a.mtopOutcomes.length === 0).length;

  return NextResponse.json({
    weekStart: weekStart.toISOString().split("T")[0],
    totalActivities,
    untaggedActivities: untagged,
    coverage,
  });
});
