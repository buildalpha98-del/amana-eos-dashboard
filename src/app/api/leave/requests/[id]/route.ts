import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateLeaveSchema = z.object({
  status: z
    .enum(["leave_pending", "leave_approved", "leave_rejected", "leave_cancelled"])
    .optional(),
  leaveType: z
    .enum([
      "annual",
      "sick",
      "personal",
      "unpaid",
      "long_service",
      "parental",
      "compassionate",
    ])
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reason: z.string().optional(),
  reviewNotes: z.string().optional(),
});

// GET /api/leave/requests/[id] — leave request detail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  if (!leaveRequest) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  return NextResponse.json(leaveRequest);
}

// PATCH /api/leave/requests/[id] — update leave request
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateLeaveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  // Status change to approved/rejected requires owner/admin
  if (
    parsed.data.status === "leave_approved" ||
    parsed.data.status === "leave_rejected"
  ) {
    if (session!.user.role !== "owner" && session!.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    data.status = parsed.data.status;
    data.reviewedById = session!.user.id;
    data.reviewedAt = new Date();
    if (parsed.data.reviewNotes) data.reviewNotes = parsed.data.reviewNotes;
  } else if (parsed.data.status) {
    data.status = parsed.data.status;
  }

  // Editing while pending — user can update their own request
  if (existing.status === "leave_pending" && existing.userId === session!.user.id) {
    if (parsed.data.leaveType) data.leaveType = parsed.data.leaveType;
    if (parsed.data.reason !== undefined) data.reason = parsed.data.reason;
    if (parsed.data.startDate) data.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate) data.endDate = new Date(parsed.data.endDate);

    // Recalculate totalDays if dates changed
    const start = parsed.data.startDate
      ? new Date(parsed.data.startDate)
      : existing.startDate;
    const end = parsed.data.endDate
      ? new Date(parsed.data.endDate)
      : existing.endDate;
    if (parsed.data.startDate || parsed.data.endDate) {
      if (start > end) {
        return NextResponse.json(
          { error: "Start date must be on or before end date" },
          { status: 400 }
        );
      }
      const diffTime = end.getTime() - start.getTime();
      data.totalDays = existing.isHalfDay
        ? 0.5
        : Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
  } else if (
    !parsed.data.status &&
    existing.userId !== session!.user.id &&
    session!.user.role !== "owner" &&
    session!.user.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.reviewNotes && !data.reviewNotes) {
    data.reviewNotes = parsed.data.reviewNotes;
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: data as any,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: parsed.data.status
        ? `leave_${parsed.data.status.replace("leave_", "")}`
        : "update_leave_request",
      entityType: "LeaveRequest",
      entityId: id,
      details: JSON.parse(JSON.stringify(parsed.data)),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/leave/requests/[id] — cancel own pending request
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
  }

  if (existing.userId !== session!.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (existing.status !== "leave_pending") {
    return NextResponse.json(
      { error: "Can only cancel pending requests" },
      { status: 400 }
    );
  }

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: { status: "leave_cancelled" },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "cancel_leave_request",
      entityType: "LeaveRequest",
      entityId: id,
      details: { leaveType: existing.leaveType },
    },
  });

  return NextResponse.json(updated);
}
