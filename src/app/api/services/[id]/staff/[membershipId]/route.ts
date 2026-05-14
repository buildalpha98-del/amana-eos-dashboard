import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateServiceStaffSchema } from "@/lib/schemas/service-staff";
import type { Role } from "@prisma/client";

const ORG_WIDE_ROLES = new Set<Role>(["owner", "head_office", "admin"]);

function canMutate(role: Role, userServiceId: string | null | undefined, serviceId: string) {
  if (ORG_WIDE_ROLES.has(role)) return true;
  if (role === "member" && userServiceId === serviceId) return true;
  return false;
}

// PATCH /api/services/[id]/staff/[membershipId]
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const params = await context!.params!;
    const serviceId = params.id as string;
    const membershipId = params.membershipId as string;
    const role = session.user.role as Role;

    if (!canMutate(role, session.user.serviceId, serviceId)) {
      throw ApiError.forbidden("You cannot manage staff at this service");
    }

    const body = await parseJsonBody(req);
    const parsed = updateServiceStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const existing = await prisma.userServiceMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, serviceId: true },
    });
    if (!existing || existing.serviceId !== serviceId) {
      throw ApiError.notFound("Membership not found");
    }

    const updated = await prisma.userServiceMembership.update({
      where: { id: membershipId },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

// DELETE /api/services/[id]/staff/[membershipId]
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const params = await context!.params!;
    const serviceId = params.id as string;
    const membershipId = params.membershipId as string;
    const role = session.user.role as Role;

    if (!canMutate(role, session.user.serviceId, serviceId)) {
      throw ApiError.forbidden("You cannot manage staff at this service");
    }

    const existing = await prisma.userServiceMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, serviceId: true, endDate: true },
    });
    if (!existing || existing.serviceId !== serviceId) {
      throw ApiError.notFound("Membership not found");
    }

    await prisma.userServiceMembership.update({
      where: { id: membershipId },
      data: {
        status: "inactive",
        endDate: existing.endDate ?? new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
