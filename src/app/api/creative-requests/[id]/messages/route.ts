import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { notifyRequestMessage } from "@/lib/creative-request/notify";
import { attachmentInputSchema } from "@/lib/creative-request/attachment-schema";

type RouteCtx = { params: Promise<{ id: string }> };

const messageInclude = {
  author: { select: { id: true, name: true } },
  attachments: true,
} as const;

/** Load the request and 404 unless the caller is a fulfiller or the requester. */
async function loadForParticipant(id: string, userId: string, role: string) {
  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: { id: true, requestNumber: true, title: true, requestedById: true, assigneeId: true },
  });
  if (!request || (!isFulfillerRole(role) && request.requestedById !== userId)) {
    throw ApiError.notFound("Request not found");
  }
  return request;
}

// ---------------------------------------------------------------------------
// GET — thread. Internal notes are stripped for non-fulfillers at the QUERY
// level (never fetched, not just hidden).
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  await loadForParticipant(id, session.user.id, session.user.role);

  const fulfiller = isFulfillerRole(session.user.role);
  const messages = await prisma.creativeRequestMessage.findMany({
    where: { requestId: id, ...(fulfiller ? {} : { internal: false }) },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ messages });
});

// ---------------------------------------------------------------------------
// POST — add a message. `internal` is only honoured for fulfiller roles.
//
// Deliberately NOT status-gated (unlike PATCH's terminal-state guard):
// delivered/cancelled requests can still receive messages — post-delivery
// follow-ups ("can we get a re-export at A3?") and cancellation questions
// are legitimate conversation, not edits to the request itself.
// ---------------------------------------------------------------------------

const postBodySchema = z.object({
  body: z.string().min(1).max(10000),
  internal: z.boolean().default(false),
  attachments: z.array(attachmentInputSchema).max(10).default([]),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const request = await loadForParticipant(id, session.user.id, session.user.role);

  const raw = await parseJsonBody(req);
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid message payload", parsed.error.flatten());
  }
  const fulfiller = isFulfillerRole(session.user.role);
  const internal = fulfiller && parsed.data.internal;

  const message = await prisma.creativeRequestMessage.create({
    data: {
      requestId: id,
      authorId: session.user.id,
      body: parsed.data.body,
      internal,
      attachments: {
        create: parsed.data.attachments.map((a) => ({
          requestId: id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileSize: a.fileSize ?? null,
          mimeType: a.mimeType ?? null,
          uploadedById: session.user.id,
        })),
      },
    },
    include: messageInclude,
  });

  await notifyRequestMessage(prisma, request, session.user.id, internal);

  return NextResponse.json({ message }, { status: 201 });
});
