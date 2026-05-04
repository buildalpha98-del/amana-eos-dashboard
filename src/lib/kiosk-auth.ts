/**
 * Kiosk bearer-token authentication.
 *
 * The kiosk POSTs requests with `Authorization: Bearer <token>` where
 * `<token>` is the long random secret issued during the admin
 * register flow (`POST /api/kiosks`). We bcrypt the token at rest in
 * `Kiosk.tokenHash` — so authenticating is "find a non-revoked Kiosk
 * whose tokenHash matches this candidate".
 *
 * Performance note: bcrypt comparisons are intentionally slow. We
 * narrow the candidate set as much as possible before hashing —
 * non-revoked rows only — and rely on the typical OSHC deployment
 * having O(10) kiosks total. If the Kiosk table grows large enough
 * to make per-request hashing painful, the right fix is a
 * deterministic index column (e.g. SHA-256 of token, indexed) used
 * to find a single row, then bcrypt-verify just that one. Out of
 * scope for v1.
 *
 * 2026-05-04: timeclock v1, sub-PR 3.
 */

import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export interface AuthenticatedKiosk {
  id: string;
  serviceId: string;
  label: string;
}

/**
 * Authenticate a request as a non-revoked Kiosk. Returns the Kiosk
 * row on success or `null` on any failure (no token, malformed
 * header, no matching kiosk, revoked kiosk).
 *
 * Side-effect: bumps `lastSeenAt = now()` on the matched kiosk so
 * admins can spot dormant tablets in the settings panel.
 */
export async function authenticateKiosk(
  req: Request,
): Promise<AuthenticatedKiosk | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  // Narrow candidate set to non-revoked rows.
  const candidates = await prisma.kiosk.findMany({
    where: { revokedAt: null },
    select: { id: true, serviceId: true, label: true, tokenHash: true },
  });

  for (const k of candidates) {
    const ok = await compare(token, k.tokenHash);
    if (ok) {
      // Fire-and-forget — don't block the request on this update.
      prisma.kiosk
        .update({
          where: { id: k.id },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => {
          /* swallow — diagnostic-only column */
        });
      return { id: k.id, serviceId: k.serviceId, label: k.label };
    }
  }
  return null;
}
