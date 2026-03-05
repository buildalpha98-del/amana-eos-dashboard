import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createLeaveSchema = z.object({
  leaveType: z.enum([
    "annual",
    "sick",
    "personal",
    "unpaid",
    "long_service",
    "parental",
    "compassionate",
  ]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  isHalfDay: z.boolean().optional(),
  reason: z.string().optional(),
});

// GET /api/leave/requests — list leave requests
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status");
  const serviceId = searchParams.get("serviceId");
  const leaveType = searchParams.get("leaveType");
  const startAfter = searchParams.get("startAfter");
  const startBefore = searchParams.get("startBefore");

  const where: Record<string, unknown> = {};

  // Staff can only see their own requests
  if (session!.user.role === "staff") {
    where.userId = session!.user.id;
  } else {
    if (userId) where.userId = userId;
  }

  if (status) where.status = status;
  if (serviceId) where.serviceId = serviceId;
  if (leaveType) where.leaveType = leaveType;

  if (startAfter || startBefore) {
    where.startDate = {};
    if (startAfter) (where.startDate as Record<string, unknown>).gte = new Date(startAfter);
    if (startBefore) (where.startDate as Record<string, unknown>).lte = new Date(startBefore);
  }

  const requests = await prisma.leaveRequest.findMany({
    where: where as any,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

// POST /api/leave/requests — submit a leave request
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = createLeaveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { leaveType, startDate, endDate, isHalfDay, reason } = parsed.data;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    return NextResponse.json(
      { error: "Start date must be on or before end date" },
      { status: 400 }
    );
  }

  // Calculate total days
  const diffTime = end.getTime() - start.getTime();
  let totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (isHalfDay) totalDays = 0.5;

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      userId: session!.user.id,
      leaveType,
      startDate: start,
      endDate: end,
      totalDays,
      isHalfDay: isHalfDay ?? false,
      reason,
      serviceId: session!.user.serviceId || null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "submit_leave_request",
      entityType: "LeaveRequest",
      entityId: leaveRequest.id,
      details: {
        leaveType,
        startDate,
        endDate,
        totalDays,
      },
    },
  });

  return NextResponse.json(leaveRequest, { status: 201 });
}
