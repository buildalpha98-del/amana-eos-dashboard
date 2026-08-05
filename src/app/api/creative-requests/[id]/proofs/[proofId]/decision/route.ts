import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ProofDecision } from "@prisma/client";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { DECISION_TO_STATUS, decisionNoteRequired } from "@/lib/creative-request/proof-rules";
import { applyStatusChange } from "@/lib/creative-request/status-change";
import { notifyProofDecision } from "@/lib/creative-request/notify";

type RouteCtx = { params: Promise<{ id: string; proofId: string }> };

const decisionSchema = z.object({
  decision: z.nativeEnum(ProofDecision),
  note: z.string().max(5000).optional(),
});

/**
 * POST — record the requester's (or a fulfiller-on-behalf) decision on a
 * proof. Drives the request status via DECISION_TO_STATUS and banks the
 * in_review pause time.
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id, proofId } = await (context as unknown as RouteCtx).params;

  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: {
      id: true, requestNumber: true, title: true, status: true,
      requestedById: true, assigneeId: true, pausedAt: true, pausedMs: true,
    },
  });
  const fulfiller = isFulfillerRole(session.user.role);
  if (!request || (!fulfiller && request.requestedById !== session.user.id)) {
    throw ApiError.notFound("Request not found");
  }

  const proof = await prisma.creativeRequestProof.findUnique({ where: { id: proofId } });
  if (!proof || proof.requestId !== id) throw ApiError.notFound("Proof not found");
  if (proof.decision) throw ApiError.conflict("This proof has already been decided");
  if (request.status !== "in_review") {
    throw ApiError.conflict("This request is not awaiting a proof decision");
  }
  // Only the LATEST version is decidable. A superseded-but-undecided proof
  // (fulfiller pulled a proof back via manual PATCH, then sent a new one)
  // must not drive the request status. Orphaned undecided proofs are
  // deliberately left as history — no backfill decision is recorded.
  const latest = await prisma.creativeRequestProof.findFirst({
    where: { requestId: id },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (latest && latest.id !== proofId) {
    throw ApiError.conflict("A newer proof supersedes this one — review the latest version");
  }

  const raw = await parseJsonBody(req);
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid decision payload", parsed.error.flatten());
  }
  const { decision, note } = parsed.data;
  if (decisionNoteRequired(decision) && !note?.trim()) {
    throw ApiError.badRequest("Please say what changes are needed");
  }

  const now = new Date();
  // Race-proof claim: the conditional updateMany means two simultaneous
  // decisions can't both land — the loser matches zero rows and 409s
  // before the request status is touched.
  const claimed = await prisma.creativeRequestProof.updateMany({
    where: { id: proofId, decision: null },
    data: { decision, decisionNote: note?.trim() || null, decidedById: session.user.id, decidedAt: now },
  });
  if (claimed.count === 0) {
    throw ApiError.conflict("This proof has already been decided");
  }
  const updatedRequest = await prisma.creativeRequest.update({
    where: { id },
    data: applyStatusChange(request, DECISION_TO_STATUS[decision], now),
  });
  const updatedProof = await prisma.creativeRequestProof.findUnique({ where: { id: proofId } });

  await notifyProofDecision(prisma, request, proof.version, decision, session.user.id);
  return NextResponse.json({ proof: updatedProof, request: updatedRequest });
});
