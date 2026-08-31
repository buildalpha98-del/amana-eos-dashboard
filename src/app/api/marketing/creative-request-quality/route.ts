import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import type { CreativeRequestType, ProofDecision } from "@prisma/client";

// ---------------------------------------------------------------------------
// GET /api/marketing/creative-request-quality?days=90
//
// Aggregates the creative-request quality loop for the analytics tab:
//   - CSAT: requester thumbs up/down after delivery (windowed on rating
//     createdAt — when the requester spoke, not when the request was made).
//   - First-proof approval: of v1 proofs decided in the window, how many were
//     approved OUTRIGHT. `approved_with_changes` approves the request but
//     means the first proof still needed fixes, so it counts in the
//     denominator (a decided v1 proof) and NOT the numerator.
// groupBy can't reach request.type across the relation, so both are small
// findMany + JS folds. Zero-data rates are null (UI renders an em-dash) —
// never 0, which would read as "0% satisfied".
// ---------------------------------------------------------------------------

type TypeBucket = {
  csatPositive: number;
  csatCount: number;
  firstProofApproved: number;
  decidedCount: number;
};

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : num / den;

async function handler(req: NextRequest) {
  const days = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "90", 10) || 90, 1),
    365,
  );
  const since = new Date(Date.now() - days * 86400000);

  const [ratings, firstProofs] = await Promise.all([
    prisma.creativeRequestSatisfaction.findMany({
      where: { createdAt: { gte: since } },
      select: { positive: true, request: { select: { type: true } } },
    }),
    prisma.creativeRequestProof.findMany({
      where: {
        version: 1,
        decision: { not: null },
        decidedAt: { gte: since },
      },
      select: { decision: true, request: { select: { type: true } } },
    }),
  ]);

  const byType = new Map<CreativeRequestType, TypeBucket>();
  const bucket = (type: CreativeRequestType): TypeBucket => {
    let b = byType.get(type);
    if (!b) {
      b = { csatPositive: 0, csatCount: 0, firstProofApproved: 0, decidedCount: 0 };
      byType.set(type, b);
    }
    return b;
  };

  let positive = 0;
  for (const r of ratings) {
    const b = bucket(r.request.type);
    b.csatCount += 1;
    if (r.positive) {
      b.csatPositive += 1;
      positive += 1;
    }
  }

  let approved = 0;
  for (const p of firstProofs) {
    const b = bucket(p.request.type);
    b.decidedCount += 1;
    // Plain approvals only — approved_with_changes stays denominator-only.
    if ((p.decision as ProofDecision) === "approved") {
      b.firstProofApproved += 1;
      approved += 1;
    }
  }

  return NextResponse.json({
    days,
    csat: {
      positive,
      negative: ratings.length - positive,
      rate: rate(positive, ratings.length),
    },
    firstProof: {
      approved,
      decided: firstProofs.length,
      rate: rate(approved, firstProofs.length),
    },
    byType: [...byType.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, b]) => ({
        type,
        csatCount: b.csatCount,
        csatRate: rate(b.csatPositive, b.csatCount),
        decidedCount: b.decidedCount,
        firstProofRate: rate(b.firstProofApproved, b.decidedCount),
      })),
  });
}

export const GET = withApiAuth(handler, {
  roles: ["owner", "head_office", "admin", "marketing"],
});
