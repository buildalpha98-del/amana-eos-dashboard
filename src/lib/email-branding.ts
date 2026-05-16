/**
 * Server-side helper that pulls live brand identity from the existing
 * OrgSettings singleton (managed via /settings → "Organisation Settings"
 * section). Used by transactional + campaign email templates that used
 * to hardcode "Amana OSHC" + "#004E64".
 *
 * Cached for 60 s in-process — brand identity rarely changes and the
 * cron-fired bulk sends can hit this dozens of times per run.
 *
 * 2026-05-16: introduced as part of the email layout / policy compliance
 * editability rollout.
 */

import { prisma } from "@/lib/prisma";

export interface EmailBranding {
  /** Header / footer brand name (e.g. "Amana OSHC"). */
  name: string;
  /** Header background + CTA color (hex with leading #). */
  primaryColor: string;
  /** Marketing footer "visit our site" URL. */
  websiteUrl: string;
  /** Marketing footer link label. */
  websiteUrlLabel: string;
}

const DEFAULTS: EmailBranding = {
  name: "Amana OSHC",
  primaryColor: "#004E64",
  websiteUrl: "https://amanaoshc.com.au",
  websiteUrlLabel: "amanaoshc.com.au",
};

const CACHE_TTL_MS = 60_000;
let cache: { value: EmailBranding; expiresAt: number } | null = null;

/** Test helper — clear the in-process cache. */
export function _clearEmailBrandingCache() {
  cache = null;
}

/**
 * Read the merged email branding (DB row → defaults).
 * Falls back to defaults if the row is missing or the DB is unreachable.
 */
export async function getEmailBranding(): Promise<EmailBranding> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  let row: { name: string; primaryColor: string } | null = null;
  try {
    row = await prisma.orgSettings.findUnique({
      where: { id: "singleton" },
      select: { name: true, primaryColor: true },
    });
  } catch {
    return DEFAULTS;
  }

  const merged: EmailBranding = {
    name: row?.name ?? DEFAULTS.name,
    primaryColor:
      row?.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(row.primaryColor)
        ? row.primaryColor
        : DEFAULTS.primaryColor,
    websiteUrl: DEFAULTS.websiteUrl,
    websiteUrlLabel: DEFAULTS.websiteUrlLabel,
  };
  cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}

export const EMAIL_BRANDING_DEFAULTS = DEFAULTS;
