import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
// Mon Jan 5 1970 UTC — first Monday after the Unix epoch (which was a Thursday).
// Anchoring rotation here makes the bucket boundaries Mon→Sun rather than Thu→Wed.
const REFERENCE_MONDAY_MS = Date.UTC(1970, 0, 5);

export interface FocusAvatar {
  serviceId: string;
  serviceName: string;
  avatarId: string;
  snapshot: unknown;
  parentAvatar: unknown;
  programmeMix: unknown;
  assetLibrary: unknown;
}

export interface FocusAvatarSlim {
  serviceId: string;
  serviceName: string;
}

/**
 * Compute the rotation index for a given date.
 *
 * Rotation key = floor(daysSinceReferenceMonday / 7). Stable: any day in the same
 * Mon–Sun window returns the same index, and consecutive weeks differ by 1.
 * `index % serviceCount` picks the focus centre.
 */
export function rotationIndexForWeek(date: Date, serviceCount: number): number {
  if (serviceCount <= 0) return 0;
  const daysSinceMonday = Math.floor((date.getTime() - REFERENCE_MONDAY_MS) / DAY_MS);
  const weekIndex = Math.floor(daysSinceMonday / 7);
  return ((weekIndex % serviceCount) + serviceCount) % serviceCount;
}

async function listFocusEligibleServices() {
  return prisma.service.findMany({
    where: { status: "active" },
    orderBy: { code: "asc" },
    select: { id: true, name: true, code: true },
  });
}

/**
 * Slim version (id + name) — cheap to call from cockpit aggregation.
 */
export async function getFocusAvatarSlimForWeek(date: Date = new Date()): Promise<FocusAvatarSlim | null> {
  const services = await listFocusEligibleServices();
  if (services.length === 0) return null;
  const idx = rotationIndexForWeek(date, services.length);
  const focus = services[idx];
  return { serviceId: focus.id, serviceName: focus.name };
}

/**
 * Full version — fetches the Avatar JSON. Used by the Tuesday prompter.
 * Returns null if the service has no Avatar yet (caller can fall back).
 */
export async function getFocusAvatarForWeek(date: Date = new Date()): Promise<FocusAvatar | null> {
  const services = await listFocusEligibleServices();
  if (services.length === 0) return null;
  const idx = rotationIndexForWeek(date, services.length);
  const focusService = services[idx];

  const avatar = await prisma.centreAvatar.findUnique({
    where: { serviceId: focusService.id },
    select: {
      id: true,
      snapshot: true,
      parentAvatar: true,
      programmeMix: true,
      assetLibrary: true,
    },
  });
  if (!avatar) return null;

  return {
    serviceId: focusService.id,
    serviceName: focusService.name,
    avatarId: avatar.id,
    snapshot: avatar.snapshot,
    parentAvatar: avatar.parentAvatar,
    programmeMix: avatar.programmeMix,
    assetLibrary: avatar.assetLibrary,
  };
}
