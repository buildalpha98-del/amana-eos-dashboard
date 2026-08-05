import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { attachmentInputSchema } from "@/lib/creative-request/attachment-schema";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { proofInclude } from "@/lib/creative-request/include";
import { canUploadProof } from "@/lib/creative-request/proof-rules";
import { applyStatusChange } from "@/lib/creative-request/status-change";
import { notifyProofReady } from "@/lib/creative-request/notify";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadForParticipant(id: string, userId: string, role: string) {
  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: {
      id: true, requestNumber: true, title: true, status: true,
      requestedById: true, assigneeId: true, pausedAt: true, pausedMs: true,
    },
  });
  if (!request || (!isFulfillerRole(role) && request.requestedById !== userId)) {
    throw ApiError.notFound("Request not found");
  }
  return request;
}

// GET — proof versions, newest first. Participants only.
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  await loadForParticipant(id, session.user.id, session.user.role);
  const proofs = await prisma.creativeRequestProof.findMany({
    where: { requestId: id },
    include: proofInclude,
    orderBy: { version: "desc" },
  });
  return NextResponse.json({ proofs });
});

// POST — upload a proof (fulfiller only). Auto-transitions to in_review.
// Single-source Blob validation: extend the shared attachment schema.
const uploadSchema = attachmentInputSchema.extend({
  note: z.string().max(5000).optional(),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!isFulfillerRole(session.user.role)) {
    throw ApiError.forbidden("Only the marketing team can upload proofs");
  }
  const request = await loadForParticipant(id, session.user.id, session.user.role);
  if (!canUploadProof(request.status)) {
    throw ApiError.conflict(`Cannot send a proof while the request is ${request.status}`);
  }

  const raw = await parseJsonBody(req);
  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid proof payload", parsed.error.flatten());
  }

  const latest = await prisma.creativeRequestProof.findFirst({
    where: { requestId: id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const now = new Date();
  let proof;
  try {
    [proof] = await prisma.$transaction([
      prisma.creativeRequestProof.create({
        data: {
          requestId: id,
          version,
          fileName: parsed.data.fileName,
          fileUrl: parsed.data.fileUrl,
          fileSize: parsed.data.fileSize ?? null,
          mimeType: parsed.data.mimeType ?? null,
          note: parsed.data.note ?? null,
          uploadedById: session.user.id,
        },
        include: proofInclude,
      }),
      prisma.creativeRequest.update({
        where: { id },
        data: applyStatusChange(request, "in_review", now),
      }),
    ]);
  } catch (err) {
    // findFirst+1 outside the transaction is deliberately simple — the
    // marketing team is effectively single-writer per request. If two
    // uploads do race, @@unique([requestId, version]) turns the loser
    // into a clean retryable conflict instead of a 500.
    if ((err as { code?: string }).code === "P2002") {
      throw ApiError.conflict("A proof was just uploaded — refresh and try again");
    }
    throw err;
  }

  await notifyProofReady(prisma, request, version, session.user.id);
  return NextResponse.json({ proof }, { status: 201 });
});
