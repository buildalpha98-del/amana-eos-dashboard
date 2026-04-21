import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { logger } from "@/lib/logger";
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
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

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
});

// PATCH /api/leave/requests/[id] — update leave request
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
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

  // Notify the requester on approval / denial. Observational — log failures but keep
  // the PATCH response successful.
  try {
    if (parsed.data.status === "leave_approved" || parsed.data.status === "leave_rejected") {
      const startStr = updated.startDate.toISOString().slice(0, 10);
      const endStr = updated.endDate.toISOString().slice(0, 10);
      const approved = parsed.data.status === "leave_approved";
      const reviewNotes = typeof data.reviewNotes === "string" ? data.reviewNotes : "";
      await prisma.userNotification.create({
        data: {
          userId: existing.userId,
          type: approved
            ? NOTIFICATION_TYPES.LEAVE_APPROVED
            : NOTIFICATION_TYPES.LEAVE_DENIED,
          title: approved ? "Leave approved" : "Leave denied",
          body: approved
            ? `Your leave from ${startStr} to ${endStr} was approved`
            : reviewNotes
              ? `Your leave from ${startStr} to ${endStr} was denied: ${reviewNotes}`
              : `Your leave from ${startStr} to ${endStr} was denied`,
          link: `/leave?id=${id}`,
        },
      });
    }
  } catch (err) {
    logger.error("Failed to create leave-decision notification", {
      err,
      leaveRequestId: id,
      status: parsed.data.status,
    });
  }

  return NextResponse.json(updated);
});

// DELETE /api/leave/requests/[id] — cancel own pending request
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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
});
