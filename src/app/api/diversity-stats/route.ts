/**
 * GET /api/diversity-stats — aggregated counts for admin dashboard.
 *
 * Privacy gates:
 *   - Admin role only (admin / owner / head_office)
 *   - Min-cell-size suppression: any bucket with count < 3 is reported
 *     as "<3" so small categories can't be reverse-identified.
 *   - We also expose `totalRespondents` and `totalActiveStaff` so the
 *     dashboard can render disclosure-rate context without revealing
 *     who specifically declined.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const MIN_CELL_SIZE = 3;

function suppress(count: number): number | "<3" {
  return count < MIN_CELL_SIZE && count > 0 ? "<3" : count;
}

type StatBucket = Record<string, number | "<3">;

export const GET = withApiAuth(
  async () => {
    const [profiles, totalActiveStaff] = await Promise.all([
      prisma.diversityProfile.findMany({
        select: {
          genderIdentity: true,
          indigenousIdentity: true,
          disabilityStatus: true,
          carerStatus: true,
          veteranStatus: true,
          bornInAustralia: true,
        },
      }),
      prisma.user.count({ where: { active: true } }),
    ]);

    // Build raw counts per field.
    const raw = {
      gender: {} as Record<string, number>,
      indigenous: {} as Record<string, number>,
      disability: {} as Record<string, number>,
      carer: {} as Record<string, number>,
      veteran: { yes: 0, no: 0, undisclosed: 0 },
      bornInAustralia: { yes: 0, no: 0, undisclosed: 0 },
    };

    for (const p of profiles) {
      const g = p.genderIdentity ?? "undisclosed";
      raw.gender[g] = (raw.gender[g] ?? 0) + 1;

      const i = p.indigenousIdentity ?? "undisclosed";
      raw.indigenous[i] = (raw.indigenous[i] ?? 0) + 1;

      const d = p.disabilityStatus ?? "undisclosed";
      raw.disability[d] = (raw.disability[d] ?? 0) + 1;

      const c = p.carerStatus ?? "undisclosed";
      raw.carer[c] = (raw.carer[c] ?? 0) + 1;

      if (p.veteranStatus === true) raw.veteran.yes++;
      else if (p.veteranStatus === false) raw.veteran.no++;
      else raw.veteran.undisclosed++;

      if (p.bornInAustralia === true) raw.bornInAustralia.yes++;
      else if (p.bornInAustralia === false) raw.bornInAustralia.no++;
      else raw.bornInAustralia.undisclosed++;
    }

    // Apply min-cell-size suppression to every bucket.
    function applySuppression(
      counts: Record<string, number>,
    ): StatBucket {
      const out: StatBucket = {};
      for (const [k, v] of Object.entries(counts)) {
        out[k] = suppress(v);
      }
      return out;
    }

    return NextResponse.json({
      totalRespondents: profiles.length,
      totalActiveStaff,
      minCellSize: MIN_CELL_SIZE,
      gender: applySuppression(raw.gender),
      indigenous: applySuppression(raw.indigenous),
      disability: applySuppression(raw.disability),
      carer: applySuppression(raw.carer),
      veteran: applySuppression(raw.veteran),
      bornInAustralia: applySuppression(raw.bornInAustralia),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
