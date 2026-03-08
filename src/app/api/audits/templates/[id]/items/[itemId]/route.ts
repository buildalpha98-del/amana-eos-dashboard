import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * PATCH /api/audits/templates/[id]/items/[itemId] — update an item
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id, itemId } = await params;
  const body = await req.json();

  const allowedFields = ["section", "question", "guidance", "responseFormat", "isRequired", "sortOrder"];
  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Verify item belongs to this template
  const item = await prisma.auditTemplateItem.findFirst({
    where: { id: itemId, templateId: id },
  });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const updated = await prisma.auditTemplateItem.update({
    where: { id: itemId },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/audits/templates/[id]/items/[itemId] — delete an item
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id, itemId } = await params;

  const item = await prisma.auditTemplateItem.findFirst({
    where: { id: itemId, templateId: id },
  });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.auditTemplateItem.delete({ where: { id: itemId } });

  return NextResponse.json({ deleted: true });
}
