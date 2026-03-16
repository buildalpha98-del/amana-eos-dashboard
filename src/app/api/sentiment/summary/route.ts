import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const scores = await prisma.sentimentScore.findMany({
    where: { createdAt: { gte: weekAgo } },
    select: { label: true, score: true, serviceId: true },
  });

  const positive = scores.filter((s) => s.label === "positive").length;
  const neutral = scores.filter((s) => s.label === "neutral").length;
  const negative = scores.filter((s) => s.label === "negative").length;
  const avgScore =
    scores.length > 0
      ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
      : null;

  return NextResponse.json({
    positive,
    neutral,
    negative,
    total: scores.length,
    avgScore,
  });
}
