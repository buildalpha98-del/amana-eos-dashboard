import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// POST /api/sequences/enrolments/:id — action-based (pause/resume/cancel)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { action } = body as { action: "pause" | "resume" | "cancel" };

  if (!["pause", "resume", "cancel"].includes(action)) {
    return NextResponse.json(
      { error: "action must be pause, resume, or cancel" },
      { status: 400 },
    );
  }

  const enrolment = await prisma.sequenceEnrolment.findUnique({
    where: { id },
    include: {
      sequence: { include: { steps: { orderBy: { stepNumber: "asc" } } } },
    },
  });

  if (!enrolment) {
    return NextResponse.json(
      { error: "Enrolment not found" },
      { status: 404 },
    );
  }

  if (action === "pause") {
    if (enrolment.status !== "active") {
      return NextResponse.json(
        { error: "Can only pause active enrolments" },
        { status: 400 },
      );
    }

    await prisma.$transaction([
      prisma.sequenceEnrolment.update({
        where: { id },
        data: { status: "paused", pausedAt: new Date() },
      }),
      prisma.sequenceStepExecution.updateMany({
        where: { enrolmentId: id, status: "pending" },
        data: { status: "cancelled" },
      }),
    ]);

    return NextResponse.json({ success: true, status: "paused" });
  }

  if (action === "resume") {
    if (enrolment.status !== "paused") {
      return NextResponse.json(
        { error: "Can only resume paused enrolments" },
        { status: 400 },
      );
    }

    // Re-schedule remaining steps from now
    const completedStepIds = new Set(
      (
        await prisma.sequenceStepExecution.findMany({
          where: { enrolmentId: id, status: "sent" },
          select: { stepId: true },
        })
      ).map((e) => e.stepId),
    );

    const remainingSteps = enrolment.sequence.steps.filter(
      (s) => !completedStepIds.has(s.id),
    );

    const now = new Date();
    const executions = remainingSteps.map((step) => ({
      enrolmentId: id,
      stepId: step.id,
      scheduledFor: new Date(now.getTime() + step.delayHours * 3600_000),
      status: "pending" as const,
    }));

    await prisma.$transaction([
      prisma.sequenceEnrolment.update({
        where: { id },
        data: { status: "active", pausedAt: null },
      }),
      ...(executions.length
        ? [prisma.sequenceStepExecution.createMany({ data: executions })]
        : []),
    ]);

    return NextResponse.json({ success: true, status: "active" });
  }

  // action === "cancel"
  if (enrolment.status === "completed" || enrolment.status === "cancelled") {
    return NextResponse.json(
      { error: `Enrolment is already ${enrolment.status}` },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.sequenceEnrolment.update({
      where: { id },
      data: { status: "cancelled" },
    }),
    prisma.sequenceStepExecution.updateMany({
      where: { enrolmentId: id, status: "pending" },
      data: { status: "cancelled" },
    }),
  ]);

  return NextResponse.json({ success: true, status: "cancelled" });
}
