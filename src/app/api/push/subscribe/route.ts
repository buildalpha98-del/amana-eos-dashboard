import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  userType: z.enum(["staff", "parent"]),
  userId: z.string().optional(),
  familyId: z.string().optional(),
});

/**
 * POST /api/push/subscribe
 * Register a browser push notification subscription.
 * Wrapped in withApiHandler for rate limiting and error handling.
 * Requires either a userId (staff) or familyId (parent) to link the subscription.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest("Invalid subscription data");
  }

  const { subscription, userType, userId, familyId } = parsed.data;

  // Must provide the matching ID for the user type
  if (userType === "staff" && !userId) {
    throw ApiError.badRequest("userId is required for staff subscriptions");
  }
  if (userType === "parent" && !familyId) {
    throw ApiError.badRequest("familyId is required for parent subscriptions");
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: userType === "staff" ? (userId ?? null) : null,
      familyId: userType === "parent" ? (familyId ?? null) : null,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: userType === "staff" ? (userId ?? null) : null,
      familyId: userType === "parent" ? (familyId ?? null) : null,
    },
  });

  return NextResponse.json({ success: true });
});
