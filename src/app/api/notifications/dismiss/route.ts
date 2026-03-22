import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const bodySchema = z.object({
  notificationIds: z.array(z.string().min(1)).min(1, "At least one notification ID is required"),
});

export const POST = withApiAuth(async (req, session) => {
  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { notificationIds } = parsed.data;

  await prisma.$transaction(
    notificationIds.map((id) =>
      prisma.notificationDismissal.upsert({
        where: { userId_notificationId: { userId: session.user.id, notificationId: id } },
        update: { dismissedAt: new Date() },
        create: { userId: session.user.id, notificationId: id },
      })
    )
  );

  return NextResponse.json({ success: true });
});
