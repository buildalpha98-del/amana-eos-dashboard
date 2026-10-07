/**
 * GET /api/policies/key — the KEY policies (Code of Conduct, Privacy …) the
 * signed-in user must read and sign before their first shift, each with its
 * short plain-English version and whether they've signed the CURRENT
 * version. Feeds the "Key policies" section on My Training (2026-10-08).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { REQUIRED_POLICY_TITLES } from "@/lib/induction";
import { effectiveSummary } from "@/lib/key-policy-summaries";

export const GET = withApiAuth(async (_req, session) => {
  const docs = await prisma.policyDocument.findMany({
    where: {
      isArchived: false,
      currentVersionId: { not: null },
      OR: [{ keyPolicy: true }, { title: { in: REQUIRED_POLICY_TITLES } }],
    },
    select: { id: true, title: true, summary: true, currentVersionId: true, updatedAt: true },
    orderBy: { title: "asc" },
  });
  const acks = docs.length
    ? await prisma.policyDocumentAcknowledgement.findMany({
        where: {
          userId: session!.user.id,
          versionId: { in: docs.map((d) => d.currentVersionId!) },
        },
        select: { versionId: true, acknowledgedAt: true },
      })
    : [];
  const signedAt = new Map(acks.map((a) => [a.versionId, a.acknowledgedAt]));

  return NextResponse.json({
    policies: docs.map((d) => ({
      id: d.id,
      title: d.title,
      summary: effectiveSummary(d),
      versionId: d.currentVersionId,
      signedAt: signedAt.get(d.currentVersionId!) ?? null,
    })),
  });
});
