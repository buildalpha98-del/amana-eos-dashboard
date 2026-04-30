import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  reviewNotes: z.string().optional(),
});

/**
 * POST /api/cowork/audits/[id]/review — mark audit as reviewed
 * Auto-creates follow-up CoworkTodos from NO items.
 */
export const POST = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { reviewNotes } = parsed.data;

  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, qualityArea: true } },
      service: { select: { id: true, name: true } },
      responses: {
        where: {
          OR: [
            { result: "no", actionRequired: { not: null } },
            { ratingValue: { lte: 3 }, actionRequired: { not: null } },
          ],
        },
        include: {
          templateItem: { select: { question: true } },
        },
      },
    },
  });

  if (!instance) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (instance.reviewedAt) {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }

  // Mark reviewed
  await prisma.auditInstance.update({
    where: { id },
    data: {
      reviewedAt: new Date(),
      reviewedById: "cowork",
      reviewNotes,
    },
  });

  // Auto-create follow-up todos for non-compliant items
  let todosCreated = 0;
  for (const response of instance.responses) {
    if (!response.actionRequired) continue;

    await prisma.coworkTodo.create({
      data: {
        centreId: instance.service.id,
        date: new Date(),
        title: `Review Action: ${response.templateItem.question.substring(0, 80)}`,
        description: `From ${instance.template.name} review (QA${instance.template.qualityArea})\nAction: ${response.actionRequired}`,
        category: "morning-prep",
        assignedRole: "member",
      },
    });
    todosCreated++;
  }

  return NextResponse.json({
    message: "Audit reviewed successfully",
    todosCreated,
    auditId: id,
  });
});
