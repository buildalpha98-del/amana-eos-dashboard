import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * PATCH /api/audits/templates/[id]/items/reorder — reorder items
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const { itemIds } = await req.json();

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: "itemIds array is required" }, { status: 400 });
  }

  // Verify all items belong to this template
  const items = await prisma.auditTemplateItem.findMany({
    where: { templateId: id },
    select: { id: true },
  });
  const validIds = new Set(items.map((i) => i.id));
  for (const itemId of itemIds) {
    if (!validIds.has(itemId)) {
      return NextResponse.json(
        { error: `Item ${itemId} does not belong to this template` },
        { status: 400 }
      );
    }
  }

  // Update sort orders in a transaction
  await prisma.$transaction(
    itemIds.map((itemId: string, index: number) =>
      prisma.auditTemplateItem.update({
        where: { id: itemId },
        data: { sortOrder: index },
      })
    )
  );

  return NextResponse.json({ reordered: itemIds.length });
}
