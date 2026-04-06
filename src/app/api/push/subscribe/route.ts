import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 },
      );
    }

    const { subscription, userType, userId, familyId } = parsed.data;

    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userId: userType === "staff" ? userId : null,
        familyId: userType === "parent" ? familyId : null,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userId: userType === "staff" ? userId : null,
        familyId: userType === "parent" ? familyId : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Push subscribe failed", { err });
    return NextResponse.json(
      { error: "Failed to register push subscription" },
      { status: 500 },
    );
  }
}
