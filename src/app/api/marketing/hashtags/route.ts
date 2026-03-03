import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createHashtagSetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["brand", "campaign", "platform", "trending"]),
  tags: z.string().min(1, "Tags are required"),
});

// GET /api/marketing/hashtags — list hashtag sets with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const hashtagSets = await prisma.marketingHashtagSet.findMany({
    where: {
      deleted: false,
      ...(category ? { category: category as any } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(hashtagSets);
}

// POST /api/marketing/hashtags — create a new hashtag set
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createHashtagSetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const hashtagSet = await prisma.marketingHashtagSet.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      tags: parsed.data.tags,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "MarketingHashtagSet",
      entityId: hashtagSet.id,
      details: { name: hashtagSet.name, category: hashtagSet.category },
    },
  });

  return NextResponse.json(hashtagSet, { status: 201 });
}
