import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJsonField, reportChecklistSchema } from "@/lib/schemas/json-fields";
import { withApiAuth } from "@/lib/server-auth";

const patchBodySchema = z.object({
  itemId: z.string().min(1),
  completed: z.boolean(),
});

/**
 * PATCH /api/cowork/reports/automation/[id]/checklist
 * Update action item completion state (called from browser, session auth)
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { itemId, completed } = parsed.data;

  const report = await prisma.coworkReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const checklist = parseJsonField(report.checklist, reportChecklistSchema, {});
  checklist[itemId] = completed;

  await prisma.coworkReport.update({
    where: { id },
    data: { checklist },
  });

  return NextResponse.json({ success: true, checklist });
});
