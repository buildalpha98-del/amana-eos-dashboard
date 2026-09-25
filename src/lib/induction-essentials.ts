/**
 * Is there an essential curriculum to be gated on at all?
 *
 * THE POINT (2026-09-19)
 * ----------------------
 * The induction gate was designed to be inert until content exists —
 * `getInductionReadiness` counts only `status: published` essential courses, so
 * an empty curriculum produces no course blocker, and the rollout notes say the
 * gate "stays inert until courses are published".
 *
 * Locked-mode never honoured that. `isInductionLocked` reads STATUS alone, so a
 * user sitting at `in_training` with an expired grace window was locked out of
 * the whole dashboard whether or not a single essential course had been
 * published. Amana's seeded courses are drafts with placeholder content, so the
 * gate was holding real coordinators against a curriculum that does not exist —
 * they opened the dashboard to four items and no way to finish anything.
 *
 * A gate with nothing behind it should not be a gate. This is the fact that
 * makes locked-mode keep the promise the rest of the system already makes.
 *
 * Cached for a minute: it is read on every token refresh, and "has anyone
 * published a course in the last 60 seconds" does not need to be exact. The
 * blast radius of staleness is one minute of the previous answer, in a window
 * that is already ~5 minutes wide for the token itself.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 60_000;

let cached: { value: boolean; at: number } | null = null;

/** Test seam — the cache is process-wide and would leak between cases. */
export function _clearEssentialsCache(): void {
  cached = null;
}

export async function hasPublishedEssentials(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const count = await prisma.lMSCourse.count({
      where: { track: "essential", status: "published", deleted: false },
    });
    cached = { value: count > 0, at: now };
    return cached.value;
  } catch (err) {
    /**
     * On a DB hiccup, report that essentials EXIST.
     *
     * That keeps locked-mode behaving exactly as it did before this flag —
     * the conservative direction. Reporting "none published" on an error
     * would unlock every gated new starter across the org the moment the
     * database blinked, which is the one outcome worth avoiding.
     */
    logger.warn("Essential-course check failed; assuming the gate applies", {
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
