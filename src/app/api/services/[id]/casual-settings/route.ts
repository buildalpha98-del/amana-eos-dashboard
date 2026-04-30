import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { casualBookingSettingsSchema } from "@/lib/service-settings";
import type { Prisma } from "@prisma/client";

// PATCH /api/services/[id]/casual-settings
//
// Dedicated route for persisting casual-booking settings on a Service.
// Client sends the FULL { bsc, asc, vc } blob (UI renders all three cards
// every time, so replace-not-merge is simpler and removes the risk of
// stale values resurfacing after a session toggle).
//
// Role narrowing:
//   - admin / owner / head_office → any service
//   - coordinator → only their own service (session.user.serviceId === id)
//   - staff / member / marketing → 403
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session.user.role ?? "";

  if (!isAdminRole(role)) {
    if (role !== "member") throw ApiError.forbidden();
    const coordinatorServiceId =
      (session.user as { serviceId?: string | null }).serviceId ?? null;
    if (!coordinatorServiceId || coordinatorServiceId !== id) {
      throw ApiError.forbidden();
    }
  }

  const body = await parseJsonBody(req);
  const parsed = casualBookingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid casualBookingSettings",
      parsed.error.flatten(),
    );
  }

  // Zod-parsed → Prisma.InputJsonValue satisfies the JSON column type
  // without an unsafe `as any` cast.
  const updated = await prisma.service.update({
    where: { id },
    data: { casualBookingSettings: parsed.data as Prisma.InputJsonValue },
  });

  return NextResponse.json({ service: updated });
});
