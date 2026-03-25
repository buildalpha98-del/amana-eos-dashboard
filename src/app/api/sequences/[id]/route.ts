import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const putSchema = z.object({
  name: z.string().min(1).optional(),
  triggerStage: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    name: z.string().min(1),
    delayHours: z.number(),
    templateKey: z.string().min(1),
    emailTemplateId: z.string().optional(),
  })).optional(),
});

const sequenceInclude = {
  steps: {
    orderBy: { stepNumber: "asc" as const },
    include: {
      emailTemplate: {
        select: { id: true, name: true, subject: true },
      },
    },
  },
  _count: {
    select: {
      enrolments: true,
    },
  },
};

// GET /api/sequences/:id — single sequence with steps and enrolment stats
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      ...sequenceInclude,
      _count: {
        select: {
          enrolments: true,
        },
      },
    },
  });

  if (!sequence) {
    return NextResponse.json(
      { error: "Sequence not found" },
      { status: 404 },
    );
  }

  // Compute enrolment stats by status
  const enrolmentStats = await prisma.sequenceEnrolment.groupBy({
    by: ["status"],
    where: { sequenceId: id },
    _count: true,
  });

  const stats = {
    active: 0,
    paused: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of enrolmentStats) {
    if (row.status in stats) {
      stats[row.status as keyof typeof stats] = row._count;
    }
  }

  return NextResponse.json({ ...sequence, enrolmentStats: stats });
});

// PUT /api/sequences/:id — update sequence and optionally replace steps
export const PUT = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Sequence not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { name, triggerStage, isActive, steps } = parsed.data;

  const sequence = await prisma.$transaction(async (tx) => {
    // If steps provided, cancel pending executions then delete and recreate
    if (steps) {
      const pendingExecs = await tx.sequenceStepExecution.count({
        where: { step: { sequenceId: id }, status: "pending" },
      });
      if (pendingExecs > 0) {
        await tx.sequenceStepExecution.updateMany({
          where: { step: { sequenceId: id }, status: "pending" },
          data: { status: "cancelled" },
        });
      }

      await tx.sequenceStep.deleteMany({ where: { sequenceId: id } });
      await tx.sequenceStep.createMany({
        data: steps.map((s, i) => ({
          sequenceId: id,
          stepNumber: i + 1,
          name: s.name,
          delayHours: s.delayHours,
          templateKey: s.templateKey,
          emailTemplateId: s.emailTemplateId || null,
        })),
      });
    }

    return tx.sequence.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(triggerStage !== undefined ? { triggerStage } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: sequenceInclude,
    });
  });

  return NextResponse.json(sequence);
});

// DELETE /api/sequences/:id — only if no active enrolments
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Sequence not found" },
      { status: 404 },
    );
  }

  const activeCount = await prisma.sequenceEnrolment.count({
    where: { sequenceId: id, status: "active" },
  });

  if (activeCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete sequence with ${activeCount} active enrolment(s). Cancel or complete them first.`,
      },
      { status: 409 },
    );
  }

  await prisma.sequence.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
