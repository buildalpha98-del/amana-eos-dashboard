/**
 * Cached Employment Hero approved-leave feed for the roster overlay
 * (staff-portal-v2 Task 5.4 follow-up).
 *
 * Staff apply for leave in Employment Hero, so the internal LeaveRequest
 * table only holds the pre-switchover backlog — the roster grid was blind
 * to real upcoming leave. This module wraps the org-wide EH leave-request
 * list (`listAllLeaveRequests("Approved")` — the same upstream the admin
 * /leave-payroll view uses) behind a small in-process cache so the roster
 * overlays endpoint can consume it without hammering EH on every grid load.
 *
 * Deliberately role-free: callers (currently only /api/roster/overlays)
 * apply their own scoping AFTER the cached org-wide fetch, exactly like
 * the internal-leave query.
 *
 * Failure mode is soft: EH unconfigured or erroring returns [] — the
 * overlay degrades to internal leave only, it never breaks the roster.
 */

import { prisma } from "@/lib/prisma";
import { isConfigured, listAllLeaveRequests } from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";

export interface EhLeaveOverlayEntry {
  /** Dashboard User id the EH employee maps to (employmentHeroEmployeeId). */
  userId: string;
  /** EH ISO datetime string — slice(0, 10) for the calendar date. */
  fromDate: string;
  toDate: string;
  totalHours: number;
}

/**
 * 5-minute TTL, mirroring the org-settings cache pattern. Staleness
 * trade-off: leave approved in EH can take up to 5 minutes (per Node
 * process) to show on the roster — acceptable for an advisory overlay,
 * and it keeps the org-wide (unpaginated) EH call off the roster's hot
 * path. The grid legend says "EH refreshes every few minutes".
 */
export const EH_LEAVE_CACHE_TTL_MS = 5 * 60_000;

let cache: { value: EhLeaveOverlayEntry[]; expiresAt: number } | null = null;

/** Log the unconfigured case once per process, not once per roster load. */
let warnedUnconfigured = false;

/** Test helper — drop the in-process cache (and the log-once flag). */
export function _clearEhLeaveCache() {
  cache = null;
  warnedUnconfigured = false;
}

/**
 * Approved EH leave requests mapped to dashboard users. Rows whose EH
 * employee has no linked User (no employmentHeroEmployeeId match) are
 * dropped — they can't be keyed to a roster row anyway.
 *
 * Cached for EH_LEAVE_CACHE_TTL_MS per Node process. On EH error the
 * empty result is cached for the same TTL so a flaky/down EH doesn't
 * add a 30s upstream stall to every roster load — and the failure is
 * logged once per cache window, not once per request.
 */
export async function getApprovedEhLeave(): Promise<EhLeaveOverlayEntry[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  if (!isConfigured()) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn(
        "EH leave overlay: Employment Hero not configured — roster shows internal leave only",
      );
    }
    return [];
  }

  let mapped: EhLeaveOverlayEntry[] = [];
  try {
    const requests = await listAllLeaveRequests("Approved");

    // One User lookup for every EH employee in the result — same join the
    // admin leave-requests route does.
    const ehIds = [...new Set(requests.map((r) => r.employeeId))];
    const users =
      ehIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { employmentHeroEmployeeId: { in: ehIds } },
            select: { id: true, employmentHeroEmployeeId: true },
          });
    const userIdByEhId = new Map(
      users.map((u) => [u.employmentHeroEmployeeId!, u.id]),
    );

    mapped = requests.flatMap((r) => {
      const userId = userIdByEhId.get(r.employeeId);
      if (!userId) return []; // unlinked EH employee — droppable
      return [
        {
          userId,
          fromDate: r.fromDate,
          toDate: r.toDate,
          totalHours: r.totalHours,
        },
      ];
    });
  } catch (err) {
    logger.warn("EH leave overlay fetch failed — roster shows internal leave only", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Negative-cache the failure for the TTL: degrade quietly rather than
    // re-stalling every roster load against a down EH.
    mapped = [];
  }

  cache = { value: mapped, expiresAt: now + EH_LEAVE_CACHE_TTL_MS };
  return mapped;
}
