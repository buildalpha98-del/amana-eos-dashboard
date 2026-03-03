import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  type: z
    .enum(["image", "video", "document", "template", "graphic"])
    .optional(),
  url: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/marketing/assets/:id — get a single asset
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const asset = await prisma.marketingAsset.findUnique({
    where: { id },
  });

  if (!asset || asset.deleted) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  return NextResponse.json(asset);
}

// PATCH /api/marketing/assets/:id — update an asset
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateAssetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingAsset.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const asset = await prisma.marketingAsset.update({
    where: { id },
    data: parsed.data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingAsset",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(asset);
}

// DELETE /api/marketing/assets/:id — soft delete an asset
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.marketingAsset.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  await prisma.marketingAsset.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingAsset",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
