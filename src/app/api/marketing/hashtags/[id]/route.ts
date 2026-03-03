import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateHashtagSetSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["brand", "campaign", "platform", "trending"]).optional(),
  tags: z.string().min(1).optional(),
});

// GET /api/marketing/hashtags/:id — get a single hashtag set
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const hashtagSet = await prisma.marketingHashtagSet.findUnique({
    where: { id },
  });

  if (!hashtagSet || hashtagSet.deleted) {
    return NextResponse.json(
      { error: "Hashtag set not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(hashtagSet);
}

// PATCH /api/marketing/hashtags/:id — update a hashtag set
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateHashtagSetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingHashtagSet.findUnique({
    where: { id },
  });
  if (!existing || existing.deleted) {
    return NextResponse.json(
      { error: "Hashtag set not found" },
      { status: 404 }
    );
  }

  const hashtagSet = await prisma.marketingHashtagSet.update({
    where: { id },
    data: parsed.data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingHashtagSet",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(hashtagSet);
}

// DELETE /api/marketing/hashtags/:id — soft delete a hashtag set
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.marketingHashtagSet.findUnique({
    where: { id },
  });
  if (!existing || existing.deleted) {
    return NextResponse.json(
      { error: "Hashtag set not found" },
      { status: 404 }
    );
  }

  await prisma.marketingHashtagSet.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingHashtagSet",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
