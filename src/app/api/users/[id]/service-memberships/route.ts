import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { bulkUserMembershipsSchema } from "@/lib/schemas/service-staff";
import type { Role } from "@prisma/client";

const ADMIN_TIER = new Set<Role>(["owner", "head_office", "admin"]);

function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

// GET /api/users/[id]/service-memberships
// Admin-tier: any user. Other roles: self only.
export const GET = withApiAuth(async (_req, session, context) => {
  const { id: userId } = await context!.params!;
  const sessionRole = session.user.role as Role;

  if (!ADMIN_TIER.has(sessionRole) && session.user.id !== userId) {
    throw ApiError.forbidden("You cannot view this user's memberships");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, serviceId: true, active: true },
  });
  if (!user) throw ApiError.notFound("User not found");

  const memberships = await prisma.userServiceMembership.findMany({
    where: { userId, status: "active" },
    include: { service: { select: { name: true } } },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json({
    primaryServiceId: user.serviceId,
    memberships: memberships.map((m) => ({
      id: m.id,
      serviceId: m.serviceId,
      serviceName: m.service.name,
      roleAtService: m.roleAtService,
      accessLevel: m.accessLevel,
      startDate: toIsoDate(m.startDate)!,
      endDate: toIsoDate(m.endDate),
      status: m.status,
    })),
  });
});

// POST /api/users/[id]/service-memberships
// Admin-tier only. Bulk-create across multiple services; idempotent
// (already-primary and already-active rows return in `skipped`).
export const POST = withApiAuth(
  async (req, _session, context) => {
    const { id: userId } = await context!.params!;

    const body = await parseJsonBody(req);
    const parsed = bulkUserMembershipsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, serviceId: true, active: true },
    });
    if (!target || !target.active) throw ApiError.notFound("User not found");

    const created: Array<{
      id: string;
      serviceId: string;
      reactivated?: boolean;
    }> = [];
    const skipped: Array<{
      serviceId: string;
      reason: "already_primary" | "already_assigned";
    }> = [];

    for (const item of parsed.data.items) {
      if (target.serviceId === item.serviceId) {
        skipped.push({ serviceId: item.serviceId, reason: "already_primary" });
        continue;
      }

      const existing = await prisma.userServiceMembership.findUnique({
        where: {
          userId_serviceId: { userId, serviceId: item.serviceId },
        },
      });

      if (existing && existing.status === "active") {
        skipped.push({
          serviceId: item.serviceId,
          reason: "already_assigned",
        });
        continue;
      }

      if (existing && existing.status === "inactive") {
        const reactivated = await prisma.userServiceMembership.update({
          where: { id: existing.id },
          data: {
            roleAtService: item.roleAtService,
            accessLevel: item.accessLevel,
            startDate: item.startDate,
            endDate: null,
            status: "active",
          },
        });
        created.push({
          id: reactivated.id,
          serviceId: reactivated.serviceId,
          reactivated: true,
        });
        continue;
      }

      try {
        const row = await prisma.userServiceMembership.create({
          data: {
            userId,
            serviceId: item.serviceId,
            roleAtService: item.roleAtService,
            accessLevel: item.accessLevel,
            startDate: item.startDate,
          },
        });
        created.push({ id: row.id, serviceId: row.serviceId });
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "P2002") {
          skipped.push({
            serviceId: item.serviceId,
            reason: "already_assigned",
          });
        } else {
          throw err;
        }
      }
    }

    return NextResponse.json({ created, skipped });
  },
  { roles: ["owner", "head_office", "admin"] },
);
