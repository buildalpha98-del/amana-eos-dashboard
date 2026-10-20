/**
 * GET /api/owna/centres — OWNA's own centre list, for Settings → OWNA
 * (Daniel, 21 Oct 2026). Each Amana centre must be linked to its OWNA
 * centre before the 30-minute sync pulls anything for it; until now there
 * was no screen to do that, so every sync run skipped every centre.
 *
 * Returns OWNA's centres plus a SUGGESTED match per Amana centre (the same
 * matcher that places enrolments by school name — it refuses to guess on a
 * tie). Staff confirm; nothing is saved here.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { getOwnaClient } from "@/lib/owna";
import { matchSchoolToService } from "@/lib/school-service-match";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(
  async () => {
    const owna = getOwnaClient();
    if (!owna) return NextResponse.json({ configured: false, centres: [], suggestions: {}, error: null });

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    });

    let centres;
    try {
      centres = await owna.getCentres();
    } catch (err) {
      logger.warn("OWNA: centre list failed", { err });
      return NextResponse.json({
        configured: true,
        centres: [],
        suggestions: {},
        error: err instanceof Error ? err.message : "Couldn't reach OWNA",
      });
    }

    // OWNA centre → the one Amana centre it clearly is (or nothing).
    const byService = new Map<string, string[]>();
    for (const c of centres) {
      const m = matchSchoolToService([c.name, c.alias, c.suburb].filter(Boolean).join(" "), services);
      if (m.serviceId && !m.ambiguous) byService.set(m.serviceId, [...(byService.get(m.serviceId) ?? []), String(c.id)]);
    }
    const suggestions: Record<string, string> = {};
    for (const [serviceId, ids] of byService) if (ids.length === 1) suggestions[serviceId] = ids[0];

    return NextResponse.json({
      configured: true,
      error: null,
      centres: centres
        .map((c) => ({
          id: String(c.id),
          name: c.name,
          alias: c.alias || null,
          suburb: c.suburb || null,
          state: c.state || null,
          children: typeof c.children === "number" ? c.children : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      suggestions,
    });
  },
  { roles: ["owner", "admin"], timeoutMs: 30_000 },
);
