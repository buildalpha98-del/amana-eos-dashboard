import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { createServiceStaffSchema } from "@/lib/schemas/service-staff";
import { deriveMembershipDefaults } from "@/lib/derive-membership-defaults";
import type { Role } from "@prisma/client";

const ORG_WIDE_ROLES = new Set<Role>(["owner", "head_office", "admin"]);

function canMutate(role: Role, userServiceId: string | null | undefined, serviceId: string) {
  if (ORG_WIDE_ROLES.has(role)) return true;
  if (role === "member" && userServiceId === serviceId) return true;
  return false;
}

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

// GET /api/services/[id]/staff
export const GET = withApiAuth(async (_req, _session, context) => {
  const { id: serviceId } = await context!.params!;

  const [primaryUsers, memberships] = await Promise.all([
    prisma.user.findMany({
      where: { serviceId, active: true },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.userServiceMembership.findMany({
      where: { serviceId, status: "active" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            active: true,
          },
        },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const members = [
    ...primaryUsers.map((u) => {
      const d = deriveMembershipDefaults(u);
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        role: u.role,
        isPrimary: true,
        isActive: u.active,
        membership: {
          id: null as string | null,
          roleAtService: d.roleAtService,
          accessLevel: d.accessLevel,
          startDate: d.startDate,
          endDate: d.endDate,
          status: d.status,
        },
      };
    }),
    ...memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatar: m.user.avatar,
      role: m.user.role,
      isPrimary: false,
      isActive: m.user.active,
      membership: {
        id: m.id,
        roleAtService: m.roleAtService,
        accessLevel: m.accessLevel,
        startDate: toIsoDate(m.startDate)!,
        endDate: toIsoDate(m.endDate),
        status: m.status,
      },
    })),
  ];

  return NextResponse.json({ members });
});

// POST /api/services/[id]/staff
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id: serviceId } = await context!.params!;
    const role = session.user.role as Role;

    if (!canMutate(role, session.user.serviceId, serviceId)) {
      throw ApiError.forbidden("You cannot manage staff at this service");
    }

    const body = await parseJsonBody(req);
    const parsed = createServiceStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, serviceId: true, active: true },
    });
    if (!targetUser || !targetUser.active) {
      throw ApiError.notFound("User not found");
    }
    if (targetUser.serviceId === serviceId) {
      throw ApiError.conflict("User is already primary at this service");
    }

    const existing = await prisma.userServiceMembership.findUnique({
      where: {
        userId_serviceId: { userId: data.userId, serviceId },
      },
    });

    if (existing && existing.status === "active") {
      throw ApiError.conflict("User is already a member of this service");
    }

    if (existing && existing.status === "inactive") {
      const reactivated = await prisma.userServiceMembership.update({
        where: { id: existing.id },
        data: {
          roleAtService: data.roleAtService,
          accessLevel: data.accessLevel,
          startDate: data.startDate,
          endDate: null,
          status: "active",
        },
      });
      return NextResponse.json(
        { ...reactivated, reactivated: true },
        { status: 200 },
      );
    }

    try {
      const created = await prisma.userServiceMembership.create({
        data: {
          userId: data.userId,
          serviceId,
          roleAtService: data.roleAtService,
          accessLevel: data.accessLevel,
          startDate: data.startDate,
        },
      });
      return NextResponse.json(created, { status: 201 });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        throw ApiError.conflict("User is already a member of this service");
      }
      throw err;
    }
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
