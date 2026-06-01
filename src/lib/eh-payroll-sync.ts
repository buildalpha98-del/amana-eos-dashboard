/**
 * Shared employee-sync logic for Employment Hero Payroll, factored out
 * of the daily cron so the admin "Run sync now" button reuses the same
 * code path (and same correctness guarantees).
 *
 * What it does (3 tiers):
 *   1. Already-mapped users — verify the EH record still exists and is
 *      Active. If terminated/missing, clear the mapping.
 *   2. Unmapped active users — try email match (lowercased + trimmed).
 *      A successful match writes the link.
 *   3. Anything else stays unmatched; admins fix via the manual-map UI.
 *
 * Returns a summary you can show to humans (logged by the cron,
 * rendered as the response of the admin "Run sync" button).
 *
 * Side effects: writes to `User.employmentHeroEmployeeId`. No other
 * tables are touched. Idempotent — running twice in a row is safe.
 */

import { prisma } from "@/lib/prisma";
import { listEmployees, type EhEmployee } from "@/lib/eh-payroll";

export interface SyncSummary {
  totalEhEmployees: number;
  activeEhEmployees: number;
  /** Already-mapped, still-valid users. No write. */
  unchanged: number;
  /** Newly auto-matched via email. */
  newlyMapped: number;
  /** Mappings cleared because the EH side became inactive / disappeared. */
  cleared: number;
  unmatchedCount: number;
  /** First 10 unmatched users — full list is in the structured log. */
  unmatchedSample: Array<{ userId: string; email: string; name: string }>;
  durationMs: number;
}

/**
 * Runs the sync once. Caller is responsible for any locking
 * (`acquireCronLock` for the cron path; nothing for admin button —
 * EH's idempotency makes back-to-back runs harmless).
 */
export async function runEmployeeSync(): Promise<SyncSummary> {
  const startMs = Date.now();
  const employees = await listEmployees();

  // O(1) lookups for both directions.
  const byEmail = new Map<string, EhEmployee>();
  const ehById = new Map<number, EhEmployee>();
  for (const e of employees) {
    ehById.set(e.id, e);
    if (e.email) {
      byEmail.set(e.email.toLowerCase().trim(), e);
    }
  }

  // Active users plus already-mapped inactive ones (so we can clear
  // stale links on terminated staff without missing them).
  const users = await prisma.user.findMany({
    where: {
      OR: [{ active: true }, { employmentHeroEmployeeId: { not: null } }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      employmentHeroEmployeeId: true,
    },
  });

  let unchanged = 0;
  let newlyMapped = 0;
  let cleared = 0;
  const unmatched: Array<{ userId: string; email: string; name: string }> = [];

  for (const u of users) {
    // Tier 1: already mapped — verify EH side still has them Active.
    if (u.employmentHeroEmployeeId !== null) {
      const eh = ehById.get(u.employmentHeroEmployeeId);
      if (!eh || eh.status !== "Active") {
        await prisma.user.update({
          where: { id: u.id },
          data: { employmentHeroEmployeeId: null },
        });
        cleared += 1;
      } else {
        unchanged += 1;
      }
      continue;
    }

    // Tier 2: unmapped, active — email match.
    if (!u.active) continue;
    const candidate = byEmail.get(u.email.toLowerCase().trim());
    if (candidate && candidate.status === "Active") {
      await prisma.user.update({
        where: { id: u.id },
        data: { employmentHeroEmployeeId: candidate.id },
      });
      newlyMapped += 1;
    } else {
      unmatched.push({ userId: u.id, email: u.email, name: u.name });
    }
  }

  return {
    totalEhEmployees: employees.length,
    activeEhEmployees: employees.filter((e) => e.status === "Active").length,
    unchanged,
    newlyMapped,
    cleared,
    unmatchedCount: unmatched.length,
    unmatchedSample: unmatched.slice(0, 10),
    durationMs: Date.now() - startMs,
  };
}
