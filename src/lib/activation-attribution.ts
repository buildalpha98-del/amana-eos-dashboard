import { prisma } from "@/lib/prisma";

/**
 * Resolve a `utm_campaign` value to a `CampaignActivationAssignment.id` if it
 * matches a known QR short code. Returns null on no match (don't block enquiry
 * creation if the param is malformed or stale).
 *
 * Used by enquiry-creation routes to populate `sourceActivationId` for QR
 * attribution.
 */
export async function resolveActivationFromUtm(
  utmCampaign: string | null | undefined,
): Promise<string | null> {
  if (!utmCampaign || typeof utmCampaign !== "string") return null;
  const trimmed = utmCampaign.trim();
  if (!trimmed) return null;
  const activation = await prisma.campaignActivationAssignment.findUnique({
    where: { qrShortCode: trimmed },
    select: { id: true },
  });
  return activation?.id ?? null;
}
