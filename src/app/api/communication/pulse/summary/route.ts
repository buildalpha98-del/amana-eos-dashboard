import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/communication/pulse/summary — Aggregated pulse data for leadership view
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const weekOf = searchParams.get("weekOf");

  if (!weekOf) {
    return NextResponse.json(
      { error: "weekOf query parameter is required" },
      { status: 400 }
    );
  }

  const weekOfDate = new Date(weekOf);

  // Get total active users
  const totalUsers = await prisma.user.count({
    where: { active: true },
  });

  // Get submitted pulses for this week (those with submittedAt set)
  const pulses = await prisma.weeklyPulse.findMany({
    where: {
      weekOf: weekOfDate,
      submittedAt: { not: null },
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const submitted = pulses.length;

  // Calculate average mood from pulses that have a mood value
  const pulsesWithMood = pulses.filter((p) => p.mood !== null);
  const avgMood =
    pulsesWithMood.length > 0
      ? Math.round(
          (pulsesWithMood.reduce((sum, p) => sum + p.mood!, 0) /
            pulsesWithMood.length) *
            10
        ) / 10
      : 0;

  // Count pulses that have non-empty blockers
  const blockerCount = pulses.filter(
    (p) => p.blockers && p.blockers.trim().length > 0
  ).length;

  return NextResponse.json({
    totalUsers,
    submitted,
    avgMood,
    blockerCount,
    pulses: pulses.map((p) => ({
      id: p.id,
      user: p.user,
      wins: p.wins,
      priorities: p.priorities,
      blockers: p.blockers,
      mood: p.mood,
      notes: p.notes,
      submittedAt: p.submittedAt,
    })),
  });
}
