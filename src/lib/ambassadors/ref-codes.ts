import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateUniqueShortCode, publicBaseUrl } from "@/lib/activation-qr";

/**
 * Educator referral codes for the Ambassadors pilot.
 *
 * Each educator/Director at a pilot centre gets a 6-char code that parents
 * carry into /parent/signup?ref=CODE. The printed QR goes through the
 * existing /a/{shortCode} redirect (a linked QrCode row) so scans land in
 * QrScan analytics; the destination of that redirect is the signup URL.
 */

/** Unambiguous charset — no 0/O, 1/I/L. */
export const REF_CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REF_CODE_LENGTH = 6;

export function generateRefCode(): string {
  const bytes = randomBytes(REF_CODE_LENGTH * 2);
  let out = "";
  for (let i = 0; i < REF_CODE_LENGTH; i++) {
    out += REF_CODE_CHARSET[bytes[i] % REF_CODE_CHARSET.length];
  }
  return out;
}

/** The URL a ref code sends parents to (and the QR redirect's destination). */
export function signupUrlForCode(code: string): string {
  return `${publicBaseUrl()}/parent/signup?ref=${code}`;
}

/**
 * Ensure every active educator (staff) and Director (member) at the pilot's
 * centres has a ref code + linked QR. Idempotent: users who already have a
 * code are left untouched (codes survive across pilots by design — one code
 * per educator, ever, so printed flyers stay valid).
 */
export async function ensureRefCodesForPilot(
  pilotId: string,
): Promise<{ created: number; existing: number }> {
  const centres = await prisma.ambassadorPilotCentre.findMany({
    where: { pilotId },
    select: { serviceId: true },
  });
  const serviceIds = centres.map((c) => c.serviceId);
  if (serviceIds.length === 0) return { created: 0, existing: 0 };

  const users = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["staff", "member"] },
      OR: [
        { serviceId: { in: serviceIds } },
        {
          serviceMemberships: {
            some: { serviceId: { in: serviceIds }, status: "active" },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      serviceId: true,
      educatorRefCode: { select: { id: true } },
    },
  });

  let created = 0;
  let existing = 0;

  for (const user of users) {
    if (user.educatorRefCode) {
      existing++;
      continue;
    }

    // Collision-retry on the unique code (30^6 ≈ 729M — collisions are
    // vanishingly rare, but the unique constraint makes retry cheap).
    let code = generateRefCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await prisma.educatorRefCode.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!clash) break;
      code = generateRefCode();
    }

    const shortCode = await generateUniqueShortCode();
    const qr = await prisma.qrCode.create({
      data: {
        shortCode,
        name: `Ambassador ref — ${user.name}`,
        description: "Amana Ambassadors educator referral QR",
        destinationUrl: signupUrlForCode(code),
        serviceId: serviceIds.includes(user.serviceId ?? "")
          ? user.serviceId
          : serviceIds[0],
      },
      select: { id: true },
    });

    await prisma.educatorRefCode.create({
      data: { userId: user.id, code, qrCodeId: qr.id },
    });
    created++;
  }

  return { created, existing };
}

/**
 * Resolve an active ref code to its educator. Returns null for unknown,
 * inactive, or deactivated-user codes.
 */
export async function resolveRefCode(
  code: string | null | undefined,
): Promise<{ userId: string; code: string } | null> {
  if (!code) return null;
  const ref = await prisma.educatorRefCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { code: true, active: true, user: { select: { id: true, active: true } } },
  });
  if (!ref || !ref.active || !ref.user.active) return null;
  return { userId: ref.user.id, code: ref.code };
}
