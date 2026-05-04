/**
 * DELETE /api/roster/shift-templates/[id]
 *
 * Drop a saved shift template. Auth mirrors the create route — admin
 * anywhere, member at their own service. No soft-delete: templates are
 * cheap to recreate and there's no audit value in keeping a tombstone.
 *
 * 2026-05-04: companion to POST /api/roster/shift-templates.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

type RouteCtx = { params: Promise<{ id: string }> };

export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!id) throw ApiError.badRequest("Missing template id");

  const template = await prisma.shiftTemplate.findUnique({
    where: { id },
    select: { id: true, serviceId: true },
  });
  if (!template) throw ApiError.notFound("Template not found");

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;

  const canDelete =
    isAdminRole(role) ||
    (role === "member" && callerServiceId === template.serviceId);
  if (!canDelete) throw ApiError.forbidden();

  await prisma.shiftTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
