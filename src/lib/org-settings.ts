/**
 * Server-only org-settings reader/writer. Builds on the shared types +
 * defaults + merger in `./org-settings-shared.ts` (which is browser-safe)
 * and adds the Prisma-backed read path + in-process cache + audited
 * writer.
 *
 * Do NOT import this file from a "use client" component — pull from
 * `@/lib/org-settings-shared` instead.
 *
 * 2026-05-16.
 */

import { prisma } from "@/lib/prisma";
import {
  mergeOrgSettings,
  ORG_SETTINGS_DEFAULTS,
  type OrgSettingsConfig,
} from "@/lib/org-settings-shared";

export {
  ORG_SETTINGS_DEFAULTS,
  orgSettingsConfigSchema,
  mergeOrgSettings,
  type OrgSettingsConfig,
} from "@/lib/org-settings-shared";

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;

let cache: { value: OrgSettingsConfig; expiresAt: number } | null = null;

/** Test helper — drop the in-process cache. */
export function _clearOrgSettingsCache() {
  cache = null;
}

// ─── Reader ─────────────────────────────────────────────────────────────────

/**
 * Read the merged org settings. Caches for 60 s per Node process.
 * Falls back to code defaults if the row is missing or the DB is
 * unreachable.
 */
export async function getOrgSettings(): Promise<OrgSettingsConfig> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let row: { config: unknown } | null = null;
  try {
    row = await prisma.orgSettings.findUnique({
      where: { id: "singleton" },
      select: { config: true },
    });
  } catch {
    // DB unreachable — return defaults rather than crashing.
    return ORG_SETTINGS_DEFAULTS;
  }

  const merged = mergeOrgSettings(row?.config);
  cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}

// ─── Writer ─────────────────────────────────────────────────────────────────

/**
 * Persist a new settings document. Owner/admin only — enforced at the
 * route layer; this function does not check permissions. Invalidates the
 * in-process cache so subsequent reads see the new values within the
 * same request lifecycle.
 */
export async function writeOrgSettings(
  next: OrgSettingsConfig,
  updatedById: string,
): Promise<OrgSettingsConfig> {
  await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", config: next, updatedById },
    update: { config: next, updatedById },
  });
  _clearOrgSettingsCache();
  return next;
}
