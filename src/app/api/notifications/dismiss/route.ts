import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error || !session) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { notificationIds } = body as { notificationIds?: string[] };

  if (!notificationIds || notificationIds.length === 0) {
    return NextResponse.json({ error: "No notification IDs provided" }, { status: 400 });
  }

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
}
