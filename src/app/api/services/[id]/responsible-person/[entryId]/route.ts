/**
 * DELETE /api/services/[id]/responsible-person/[entryId]
 *
 * Clears a single designated-RP record. Edit-gated to admin-tier or the
 * service's own Director (member), same as the upsert. The entry is checked
 * to belong to the service in the URL so one service can't delete another's
 * register rows by id.
 *
 * 2026-06-11: introduced with the RP register.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

type RouteCtx = { params: Promise<{ id: string; entryId: string }> };

export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id: serviceId, entryId } = await (context as unknown as RouteCtx).params;
  const role = session.user.role ?? "";
  const userServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;
  const canEdit =
    isAdminRole(role) || (role === "member" && userServiceId === serviceId);
  if (!canEdit) {
    throw ApiError.forbidden("You can't edit this service's register.");
  }

  const existing = await prisma.responsiblePersonEntry.findUnique({
    where: { id: entryId },
    select: { id: true, serviceId: true },
  });
  if (!existing || existing.serviceId !== serviceId) {
    throw ApiError.notFound("Register entry not found");
  }

  await prisma.responsiblePersonEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
});
