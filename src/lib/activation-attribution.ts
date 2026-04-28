import { prisma } from "@/lib/prisma";

/**
 * Resolve a `utm_campaign` value (= a QR short code) to its
 * `CampaignActivationAssignment.id` if the QR is linked to one.
 * Returns null on no match (don't block enquiry creation if the param is
 * malformed, stale, or the QR isn't activation-linked).
 *
 * Used by enquiry-creation routes to populate `sourceActivationId` for QR
 * attribution. After Sprint 8's QR Hub redesign, QR codes are standalone;
 * we look them up by `QrCode.shortCode` and read `QrCode.activationId`.
 */
export async function resolveActivationFromUtm(
  utmCampaign: string | null | undefined,
): Promise<string | null> {
  if (!utmCampaign || typeof utmCampaign !== "string") return null;
  const trimmed = utmCampaign.trim();
  if (!trimmed) return null;
  const qr = await prisma.qrCode.findUnique({
    where: { shortCode: trimmed },
    select: { activationId: true },
  });
  return qr?.activationId ?? null;
}
