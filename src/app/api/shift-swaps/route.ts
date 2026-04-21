import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";

// ---------------------------------------------------------------------------
// POST /api/shift-swaps — propose a shift swap
// Only the shift owner (proposer) may propose. Target must be an active user
// at the same service, and not the proposer themselves.
// ---------------------------------------------------------------------------

const proposeSchema = z.object({
  shiftId: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.string().optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const { shiftId, targetId, reason } = parsed.data;

  const shift = await prisma.rosterShift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      userId: true,
      serviceId: true,
      date: true,
      shiftStart: true,
      shiftEnd: true,
    },
  });
  if (!shift) throw ApiError.notFound("Shift not found");
  if (shift.userId !== session.user.id) {
    throw ApiError.forbidden("Only the shift owner can propose a swap");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, active: true, serviceId: true },
  });
  if (!target) throw ApiError.notFound("Target user not found");
  if (!target.active) throw ApiError.badRequest("Target user is not active");
  if (target.serviceId !== shift.serviceId) {
    throw ApiError.badRequest("Target must be at same service as the shift");
  }
  if (target.id === session.user.id) {
    throw ApiError.badRequest("Cannot swap with yourself");
  }

  const swap = await prisma.$transaction(async (tx) => {
    const created = await tx.shiftSwapRequest.create({
      data: {
        shiftId,
        proposerId: session.user.id,
        targetId,
        reason,
        status: "proposed",
      },
    });
    await tx.userNotification.create({
      data: {
        userId: targetId,
        type: NOTIFICATION_TYPES.SHIFT_SWAP_PROPOSED,
        title: `${session.user.name ?? "A colleague"} proposed a shift swap`,
        body: `Shift on ${shift.date.toISOString().split("T")[0]} ${shift.shiftStart}–${shift.shiftEnd}`,
        link: `/roster/me?swap=${created.id}`,
      },
    });
    return created;
  });

  return NextResponse.json({ swap }, { status: 201 });
});

// ---------------------------------------------------------------------------
// GET /api/shift-swaps?status=&scope=mine|service|all — list swap requests
// - scope=mine: requests where session user is proposer or target
// - scope=service: admin sees all; coordinator scoped to own service
// - scope=all: admin only
// ---------------------------------------------------------------------------

const listSchema = z.object({
  status: z
    .enum(["proposed", "accepted", "approved", "rejected", "cancelled"])
    .optional(),
  scope: z.enum(["mine", "service", "all"]).default("mine"),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = listSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const { status, scope } = parsed.data;
  const role = session.user.role ?? "";
  const isAdmin = isAdminRole(role);

  const where: Record<string, unknown> = {};
  if (scope === "mine") {
    where.OR = [
      { proposerId: session.user.id },
      { targetId: session.user.id },
    ];
  } else if (scope === "service") {
    // Admins see everything; coordinators scoped to own service.
    if (!isAdmin) {
      where.shift = { serviceId: session.user.serviceId ?? "__none__" };
    }
  } else if (scope === "all") {
    if (!isAdmin) throw ApiError.forbidden("Only admins may use scope=all");
  }
  if (status) where.status = status;

  const swaps = await prisma.shiftSwapRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      shift: {
        select: {
          id: true,
          date: true,
          shiftStart: true,
          shiftEnd: true,
          sessionType: true,
          serviceId: true,
        },
      },
      proposer: { select: { id: true, name: true } },
      target: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ swaps });
});
