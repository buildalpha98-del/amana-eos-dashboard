/**
 * Canonical dashboard origin for server-generated absolute links (email
 * deep links, cron notification CTAs, QR scan URLs).
 *
 * NEXTAUTH_URL is set in every deployed environment, so the fallback only
 * matters for misconfigured/local contexts — it must still be a domain that
 * actually resolves. (The previous inline fallback, dashboard.amanaoshc.com.au,
 * was a dead domain — 2026-08-10 sweep replaced every
 * `process.env.NEXTAUTH_URL || "..."` with this helper.)
 */
export const SITE_URL_FALLBACK = "https://amanaoshc.company";

export function siteUrl(): string {
  return process.env.NEXTAUTH_URL || SITE_URL_FALLBACK;
}
