/**
 * Shared centre name resolution for VAPI calls.
 *
 * VAPI may report a centre as "Malek Fahd Greenacre", "MFIS Greenacre",
 * or just "Greenacre". This module fuzzy-matches whatever the caller said
 * against our known centres to find (a) the Service record in our DB and
 * (b) the coordinator email for notifications.
 */

import { prisma } from "@/lib/prisma";

interface CentreEntry {
  keywords: string[];
  coordinatorEmail: string;
  /** Substring to match against Service.name or Service.code when resolving serviceId */
  serviceMatch: string;
}

const CENTRES: CentreEntry[] = [
  { keywords: ["greenacre", "mfis greenacre", "malek fahd greenacre"], coordinatorEmail: "coordinator.greenacre@amanaoshc.com.au", serviceMatch: "greenacre" },
  { keywords: ["hoxton park", "mfis hoxton", "malek fahd hoxton"], coordinatorEmail: "MFIShp@amanaoshc.com.au", serviceMatch: "hoxton" },
  { keywords: ["beaumont hills", "mfis beaumont", "malek fahd beaumont"], coordinatorEmail: "mfisbh@amanaoshc.com.au", serviceMatch: "beaumont" },
  { keywords: ["arkana", "kingsgrove"], coordinatorEmail: "arkanacollege@amanaoshc.com.au", serviceMatch: "arkana" },
  { keywords: ["unity grammar", "austral"], coordinatorEmail: "unitygrammar@amanaoshc.com.au", serviceMatch: "unity" },
  { keywords: ["al-taqwa", "altaqwa", "truganina"], coordinatorEmail: "altaqwacollege@amanaoshc.com.au", serviceMatch: "taqwa" },
  { keywords: ["minaret officer", "officer"], coordinatorEmail: "minaretofficer@amanaoshc.com.au", serviceMatch: "officer" },
  { keywords: ["minaret springvale", "springvale"], coordinatorEmail: "minaretspringvale@amanaoshc.com.au", serviceMatch: "springvale" },
  { keywords: ["minaret doveton", "doveton"], coordinatorEmail: "minaretdoveton@amanaoshc.com.au", serviceMatch: "doveton" },
  { keywords: ["aia", "kkcc", "coburg", "australian international academy"], coordinatorEmail: "Aiakkcc@amanaoshc.com.au", serviceMatch: "coburg" },
];

function matchCentre(centreName: string | null | undefined): CentreEntry | undefined {
  if (!centreName) return undefined;
  const lower = centreName.toLowerCase();
  return CENTRES.find((entry) => entry.keywords.some((kw) => lower.includes(kw)));
}

export function findCoordinatorEmail(centreName: string | null | undefined): string | undefined {
  return matchCentre(centreName)?.coordinatorEmail;
}

/**
 * Resolve a free-form centre name (as spoken by the caller) to a Service.id.
 * Returns null if no match found. Logs nothing on miss so callers can decide
 * whether to warn.
 */
export async function resolveServiceId(centreName: string | null | undefined): Promise<string | null> {
  const match = matchCentre(centreName);
  if (!match) return null;

  const service = await prisma.service.findFirst({
    where: {
      status: "active",
      OR: [
        { name: { contains: match.serviceMatch, mode: "insensitive" } },
        { code: { contains: match.serviceMatch, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  return service?.id ?? null;
}
