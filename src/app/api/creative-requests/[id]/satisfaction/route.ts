import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isFulfillerRole } from "@/lib/creative-request/constants";

type RouteCtx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST — one-tap CSAT from the requester on a delivered request.
//
// `delivered` is terminal and the request PATCH rejects edits on closed
// requests, so the rating lives on its own endpoint. Rating is REQUESTER-only
// (it's the customer's voice) — fulfillers who aren't the requester get 403;
// an owner/marketing self-request may still rate its own delivery because
// requester == caller is the rule. One rating per request, enforced by the
// requestId @@unique (P2002 → 409). No notification fires here — the
// delivered status-change notification already prompted the requester.
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  positive: z.boolean(),
  comment: z.string().max(2000).optional(),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid rating payload", parsed.error.flatten());
  }

  const request = await prisma.creativeRequest.findUnique({
    where: { id },
    select: { id: true, status: true, requestedById: true },
  });
  // Same non-leak participant rule as the detail route: unknown request and
  // non-participant both read as 404.
  if (
    !request ||
    (!isFulfillerRole(session.user.role) &&
      request.requestedById !== session.user.id)
  ) {
    throw ApiError.notFound("Request not found");
  }
  if (request.requestedById !== session.user.id) {
    throw ApiError.forbidden("Only the requester can rate a delivery");
  }
  if (request.status !== "delivered") {
    throw ApiError.conflict("You can rate a request once it's delivered");
  }

  try {
    const satisfaction = await prisma.creativeRequestSatisfaction.create({
      data: {
        requestId: request.id,
        positive: parsed.data.positive,
        comment: parsed.data.comment ?? null,
        ratedById: session.user.id,
      },
    });
    return NextResponse.json({ satisfaction }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw ApiError.conflict("This delivery is already rated");
    }
    throw err;
  }
});
