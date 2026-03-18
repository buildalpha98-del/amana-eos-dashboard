import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

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
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
}

// PUT /api/sequences/:id — update sequence and optionally replace steps
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Sequence not found" },
      { status: 404 },
    );
  }

  const body = await req.json();
  const { name, triggerStage, isActive, steps } = body as {
    name?: string;
    triggerStage?: string | null;
    isActive?: boolean;
    steps?: Array<{
      name: string;
      delayHours: number;
      templateKey: string;
      emailTemplateId?: string;
    }>;
  };

  // If steps provided, delete existing and recreate
  if (steps) {
    await prisma.sequenceStep.deleteMany({ where: { sequenceId: id } });
    await prisma.sequenceStep.createMany({
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

  const sequence = await prisma.sequence.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(triggerStage !== undefined ? { triggerStage } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: sequenceInclude,
  });

  return NextResponse.json(sequence);
}

// DELETE /api/sequences/:id — only if no active enrolments
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
}
