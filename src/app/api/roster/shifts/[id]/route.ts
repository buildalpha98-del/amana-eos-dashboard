import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Partial-update schema mirrors the create schema but every field optional.
// ---------------------------------------------------------------------------

const patchShiftSchema = z
  .object({
    serviceId: z.string().min(1),
    userId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sessionType: z.enum(["bsc", "asc", "vc"]),
    shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
    shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
    role: z.string().nullish(),
    status: z.enum(["draft", "published"]),
  })
  .partial();

// ---------------------------------------------------------------------------
// PATCH /api/roster/shifts/[id]
// ---------------------------------------------------------------------------

export const PATCH = withApiAuth(async (req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const body = await parseJsonBody(req);
  const parsed = patchShiftSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const data = parsed.data;

  const existing = await prisma.rosterShift.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Shift not found");

  const role = session.user.role ?? "";
  const targetServiceId = data.serviceId ?? existing.serviceId;
  if (!isAdminRole(role)) {
    if (role !== "coordinator") throw ApiError.forbidden();
    // Coordinators must own BOTH the existing and the proposed service.
    if (
      session.user.serviceId !== existing.serviceId ||
      session.user.serviceId !== targetServiceId
    ) {
      throw ApiError.forbidden();
    }
  }

  // Validate time window if both ends supplied or one changes.
  const nextStart = data.shiftStart ?? existing.shiftStart;
  const nextEnd = data.shiftEnd ?? existing.shiftEnd;
  if (nextStart >= nextEnd) {
    throw ApiError.badRequest("shiftEnd must be later than shiftStart");
  }

  // If userId changes, re-hydrate staffName from the new user.
  let staffNameUpdate: string | undefined;
  if (data.userId && data.userId !== existing.userId) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { name: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    staffNameUpdate = user.name;
  }

  const shift = await prisma.rosterShift.update({
    where: { id },
    data: {
      ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
      ...(data.userId !== undefined && { userId: data.userId }),
      ...(staffNameUpdate !== undefined && { staffName: staffNameUpdate }),
      ...(data.date !== undefined && { date: new Date(data.date) }),
      ...(data.sessionType !== undefined && { sessionType: data.sessionType }),
      ...(data.shiftStart !== undefined && { shiftStart: data.shiftStart }),
      ...(data.shiftEnd !== undefined && { shiftEnd: data.shiftEnd }),
      ...(data.role !== undefined && { role: data.role ?? null }),
      ...(data.status !== undefined && { status: data.status }),
    },
  });
  return NextResponse.json({ shift });
});

// ---------------------------------------------------------------------------
// DELETE /api/roster/shifts/[id]
// Blocks delete if a swap is pending (proposed/accepted).
// ---------------------------------------------------------------------------

export const DELETE = withApiAuth(async (_req, session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Missing shift id");

  const existing = await prisma.rosterShift.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Shift not found");

  const role = session.user.role ?? "";
  if (!isAdminRole(role)) {
    if (role !== "coordinator" || session.user.serviceId !== existing.serviceId) {
      throw ApiError.forbidden();
    }
  }

  const pendingSwap = await prisma.shiftSwapRequest.findFirst({
    where: { shiftId: id, status: { in: ["proposed", "accepted"] } },
  });
  if (pendingSwap) {
    throw ApiError.conflict("Cannot delete shift with pending swap request");
  }

  await prisma.rosterShift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
