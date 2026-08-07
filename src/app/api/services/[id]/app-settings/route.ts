/**
 * PATCH /api/services/[id]/app-settings
 *
 * Per-centre behaviour toggles: what families can do in the app, and how
 * posts get published. Mirrors the casual-settings route — a dedicated
 * endpoint per settings group, taking the full blob and replacing it, so
 * a value can't survive being switched off.
 *
 * Only toggles that change server behaviour live here; see
 * src/lib/app-settings.ts for why.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { appSettingsSchema, resolveAppSettings } from "@/lib/app-settings";
import type { Prisma } from "@prisma/client";

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const role = session.user.role ?? "";
  const ownService =
    (session.user as { serviceId?: string | null }).serviceId === id;
  if (!isAdminRole(role) && !ownService) throw ApiError.forbidden();

  const service = await prisma.service.findUnique({
    where: { id },
    select: { appSettings: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  // Always fully resolved: the client should never have to remember
  // which way an absent value falls.
  return NextResponse.json({ settings: resolveAppSettings(service.appSettings) });
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session.user.role ?? "";

  // Same narrowing as casual settings: admin tier anywhere, a Director
  // of Service only at their own centre, nobody else.
  if (!isAdminRole(role)) {
    if (role !== "member") throw ApiError.forbidden();
    const coordinatorServiceId =
      (session.user as { serviceId?: string | null }).serviceId ?? null;
    if (!coordinatorServiceId || coordinatorServiceId !== id) {
      throw ApiError.forbidden();
    }
  }

  const parsed = appSettingsSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid app settings", parsed.error.flatten());
  }

  const updated = await prisma.service.update({
    where: { id },
    data: { appSettings: parsed.data as Prisma.InputJsonValue },
    select: { appSettings: true },
  });

  return NextResponse.json({ settings: resolveAppSettings(updated.appSettings) });
});
