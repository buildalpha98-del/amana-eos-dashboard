import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
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
});
