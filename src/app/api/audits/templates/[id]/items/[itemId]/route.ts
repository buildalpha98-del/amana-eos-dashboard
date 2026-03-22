import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchSchema = z.object({
  section: z.string().optional(),
  question: z.string().min(1).optional(),
  guidance: z.string().optional(),
  responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

/**
 * PATCH /api/audits/templates/[id]/items/[itemId] — update an item
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, itemId } = await context!.params!;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  const allowedFields = ["section", "question", "guidance", "responseFormat", "isRequired", "sortOrder"] as const;
  for (const key of allowedFields) {
    if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
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
}, { roles: ["owner", "head_office", "admin"] });

/**
 * DELETE /api/audits/templates/[id]/items/[itemId] — delete an item
 */
export const DELETE = withApiAuth(async (req, session, context) => {
const { id, itemId } = await context!.params!;

  const item = await prisma.auditTemplateItem.findFirst({
    where: { id: itemId, templateId: id },
  });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  await prisma.auditTemplateItem.delete({ where: { id: itemId } });

  return NextResponse.json({ deleted: true });
}, { roles: ["owner", "head_office", "admin"] });
