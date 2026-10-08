/**
 * Per-centre "staff can clock in from their own phone" switch (Settings →
 * Staff, 2026-10-08). Every SELF-SERVICE clock route calls this; the kiosk
 * route never does — kiosk-only is the whole point of turning it off.
 */
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { PHONE_CLOCK_IN_OFF_MESSAGE, resolveAppSettings } from "@/lib/app-settings";

export async function assertPhoneClockInAllowed(
  serviceId: string | null | undefined,
): Promise<void> {
  if (!serviceId) return;
  const svc = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { appSettings: true },
  });
  if (!resolveAppSettings(svc?.appSettings).staff.phoneClockIn) {
    throw ApiError.forbidden(PHONE_CLOCK_IN_OFF_MESSAGE);
  }
}
