import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJsonField, reportChecklistSchema } from "@/lib/schemas/json-fields";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

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
  const body = await parseJsonBody(req);
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { itemId, completed } = parsed.data;

  // Use a transaction to read-modify-write atomically (prevents last-write-wins race)
  const checklist = await prisma.$transaction(async (tx) => {
    const report = await tx.coworkReport.findUnique({ where: { id } });
    if (!report) {
      throw ApiError.notFound("Report not found");
    }

    const current = parseJsonField(report.checklist, reportChecklistSchema, {});
    current[itemId] = completed;

    await tx.coworkReport.update({
      where: { id },
      data: { checklist: current },
    });

    return current;
  });

  return NextResponse.json({ success: true, checklist });
});
