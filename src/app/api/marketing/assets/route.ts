import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createAssetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z
    .enum(["image", "video", "document", "template", "graphic"])
    .default("image"),
  url: z.string().min(1, "URL is required"),
  tags: z.array(z.string()).optional(),
});

// GET /api/marketing/assets — list assets with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const search = searchParams.get("search");

  const assets = await prisma.marketingAsset.findMany({
    where: {
      deleted: false,
      ...(type ? { type: type as any } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { tags: { has: search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assets);
}

// POST /api/marketing/assets — create a new asset
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createAssetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const asset = await prisma.marketingAsset.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      url: parsed.data.url,
      tags: parsed.data.tags || [],
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "MarketingAsset",
      entityId: asset.id,
      details: { name: asset.name, type: asset.type },
    },
  });

  return NextResponse.json(asset, { status: 201 });
}
