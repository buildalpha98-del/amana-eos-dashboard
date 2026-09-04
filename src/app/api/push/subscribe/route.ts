import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  // Legacy fields from the pre-auth body shape. Accepted so old clients
  // still validate, but NEVER trusted — the subscription is always bound
  // to the session user (the old route let any caller register a push
  // subscription against any userId/familyId).
  userType: z.enum(["staff", "parent"]).optional(),
  userId: z.string().optional(),
  familyId: z.string().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

/**
 * POST /api/push/subscribe
 * Register a browser push subscription for the signed-in STAFF user.
 * The userId comes from the session — client-supplied ids are ignored.
 *
 * Parents subscribe via `/api/parent/push/subscription` (withParentAuth);
 * that flow is separate and untouched.
 */
export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest("Invalid subscription data");
  }

  const { subscription } = parsed.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: session.user.id,
      familyId: null,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: session.user.id,
      familyId: null,
    },
  });

  return NextResponse.json({ success: true });
});

/**
 * DELETE /api/push/subscribe
 * Remove a push subscription. Scoped to the session user's own rows so an
 * endpoint URL can never be used to delete another user's subscription.
 */
export const DELETE = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = unsubscribeSchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest("Invalid unsubscribe data");
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
});
