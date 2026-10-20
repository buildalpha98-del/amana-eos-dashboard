/**
 * The website's public centre details (amanaoshc.com.au/api/centres), read by
 * the parent emails (Daniel, 20 Oct 2026): "everything lives on the website" —
 * the centre's own phone, session times, where to find us, map and welcome
 * pack. Cached for an hour; any failure returns null and the emails fall back
 * to the dashboard's centre settings, so a website blip never blocks an email.
 */
import { logger } from "@/lib/logger";
import { WEBSITE_ORIGIN } from "@/lib/centre-welcome-defaults";

export interface WebsiteCentre {
  slug: string;
  serviceCode: string;
  name: string;
  address: string | null;
  phone: string | null;
  bsc: { times: string; days: string } | null;
  asc: { times: string; days: string } | null;
  locationNote: string | null;
  mapImage: string | null;
  geo: { lat: number; lon: number } | null;
  coordinator: { name: string; photo: string | null } | null;
  welcomePack: string | null;
  pageUrl: string | null;
}

const TTL = 60 * 60 * 1000;
let cache: { at: number; byCode: Map<string, WebsiteCentre> } | null = null;

export async function websiteCentre(serviceCode: string | null | undefined): Promise<WebsiteCentre | null> {
  if (!serviceCode) return null;
  if (!cache || Date.now() - cache.at > TTL) {
    try {
      const res = await fetch(`${WEBSITE_ORIGIN}/api/centres`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { centres?: WebsiteCentre[] };
      cache = { at: Date.now(), byCode: new Map((body.centres ?? []).map((c) => [c.serviceCode, c])) };
    } catch (err) {
      logger.warn("Website centre details unavailable — using dashboard settings", { err: String(err) });
      return cache?.byCode.get(serviceCode) ?? null;
    }
  }
  return cache.byCode.get(serviceCode) ?? null;
}

/** Test helper. */
export function _clearWebsiteCentreCache() {
  cache = null;
}

/** "Before school 6:30 AM – 8:30 AM (Mon–Fri)" lines, or [] when unknown. */
export function websiteSessionTimes(c: WebsiteCentre): string[] {
  const line = (label: string, s: { times: string; days: string } | null) =>
    s?.times ? `${label} ${s.times}${s.days ? ` (${s.days})` : ""}` : null;
  return [line("Before school", c.bsc), line("After school", c.asc)].filter((l): l is string => !!l);
}
