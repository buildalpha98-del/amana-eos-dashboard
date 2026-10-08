/**
 * GET/PATCH /api/users/[id]/access — a person's permission ticks,
 * registered positions and "don't count in ratio" (2026-10-08, after
 * OWNA's staff "Access & Permissions").
 *
 * Who may CHANGE them:
 *  - the office (owner / head_office / admin): anyone but themselves;
 *  - a Director of Service (`member`): EDUCATORS at their own centre only.
 *    Not another Director, and never themselves — a Director who could
 *    tick their own `posts.publish` would walk straight round the
 *    "only admins publish" switch the office set for them.
 * Anyone may READ their own (positions show on their profile).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { STAFF_PERMISSION_KEYS, STAFF_POSITION_KEYS } from "@/lib/staff-permissions";
import type { Session } from "next-auth";

type RouteCtx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    permissions: z.array(z.string()).max(20).optional(),
    positions: z.array(z.string()).max(20).optional(),
    excludeFromRatio: z.boolean().optional(),
  })
  .strict();

function canEditAccess(
  session: Session,
  target: { id: string; role: string; serviceId: string | null },
): boolean {
  if (target.id === session.user.id) return false;
  const role = session.user.role ?? "";
  if (isAdminRole(role)) return true;
  if (role !== "member") return false;
  const own = (session.user as { serviceId?: string | null }).serviceId ?? null;
  return target.role === "staff" && own !== null && target.serviceId === own;
}

async function loadTarget(id: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      serviceId: true,
      permissions: true,
      positions: true,
      excludeFromRatio: true,
    },
  });
  if (!target) throw ApiError.notFound("User not found");
  return target;
}

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const target = await loadTarget(id);
  const canEdit = canEditAccess(session, target);
  const isSelf = target.id === session.user.id;
  if (!canEdit && !isSelf && !isAdminRole(session.user.role ?? "")) {
    throw ApiError.forbidden();
  }
  return NextResponse.json({
    permissions: target.permissions,
    positions: target.positions,
    excludeFromRatio: target.excludeFromRatio,
    canEdit,
  });
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  const target = await loadTarget(id);
  if (!canEditAccess(session, target)) {
    throw ApiError.forbidden(
      target.id === session.user.id
        ? "You can't change your own access."
        : "Only head office, or the Director for an educator at their centre, can change this.",
    );
  }

  const parsed = patchSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid access settings", parsed.error.flatten().fieldErrors);
  }
  const { permissions, positions, excludeFromRatio } = parsed.data;

  // Whitelisted — an unknown key is refused, never stored, so a typo can't
  // sit in the column looking like a grant.
  const badPerm = permissions?.find((p) => !STAFF_PERMISSION_KEYS.includes(p));
  if (badPerm) throw ApiError.badRequest(`Unknown permission: ${badPerm}`);
  const badPos = positions?.find((p) => !STAFF_POSITION_KEYS.includes(p));
  if (badPos) throw ApiError.badRequest(`Unknown position: ${badPos}`);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(permissions ? { permissions: [...new Set(permissions)] } : {}),
      ...(positions ? { positions: [...new Set(positions)] } : {}),
      ...(excludeFromRatio !== undefined ? { excludeFromRatio } : {}),
    },
    select: { permissions: true, positions: true, excludeFromRatio: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "staff_access_changed",
      entityType: "User",
      entityId: id,
      details: JSON.parse(
        JSON.stringify({
          before: {
            permissions: target.permissions,
            positions: target.positions,
            excludeFromRatio: target.excludeFromRatio,
          },
          after: updated,
        }),
      ),
    },
  });

  return NextResponse.json({ ...updated, canEdit: true });
});
