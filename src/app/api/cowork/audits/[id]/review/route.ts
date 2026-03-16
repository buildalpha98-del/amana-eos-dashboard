import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/audits/[id]/review — mark audit as reviewed
 * Auto-creates follow-up CoworkTodos from NO items.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { id } = await params;
  const body = await req.json();
  const { reviewNotes } = body as { reviewNotes?: string };

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
        assignedRole: "coordinator",
      },
    });
    todosCreated++;
  }

  return NextResponse.json({
    message: "Audit reviewed successfully",
    todosCreated,
    auditId: id,
  });
}
