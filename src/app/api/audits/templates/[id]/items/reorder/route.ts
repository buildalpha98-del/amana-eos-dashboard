import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, "itemIds array is required"),
});

/**
 * PATCH /api/audits/templates/[id]/items/reorder — reorder items
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { itemIds } = parsed.data;

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
}, { roles: ["owner", "head_office", "admin"] });
