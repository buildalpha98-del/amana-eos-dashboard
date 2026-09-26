import { logger } from "@/lib/logger";
import { extractTextFromBuffer } from "@/lib/document-indexer";
import { isAllowedReferenceHost } from "@/lib/reference-hosts";
import { REGULATOR_SOURCES } from "../regulator-sources";
import { upsertKnowledgeSource, excludeSources } from "../pipeline";
import type { UpsertResult } from "../types";

export interface RegulatorReport {
  results: UpsertResult[];
  errors: { id: string; error: string }[];
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024; // PDFs of the National Regs guide are ~2 MB
const MAX_REDIRECTS = 2;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Several .gov.au bot-management layers reset the connection outright for
// an unrecognised/bot-shaped User-Agent — fairwork.gov.au,
// safeworkaustralia.gov.au and nhmrc.gov.au all did this against the plain
// "AmanaOSHC-KnowledgeBot/1.0" string (verified 2026-09-26). A
// browser-shaped UA (with our own token appended, for server-side
// identification) gets through.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 AmanaOSHC-KnowledgeBot/1.0";

/** HTML → text. Nav chrome survives (acceptable for slice 1); scripts/styles do not. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/**
 * Fetch `startUrl`, following up to MAX_REDIRECTS 3xx hops ourselves.
 * `redirect: "manual"` (rather than the default "follow") is what makes
 * each hop inspectable: we read Location, resolve it against the CURRENT
 * url (so a relative Location on a later hop still works), and only
 * continue when the resolved host is still allow-listed — the SSRF
 * property (no hop can leave the allow-list) is preserved; it's enforced
 * per-hop instead of by refusing every redirect outright. A fresh
 * AbortController (and timeout) covers each hop.
 */
async function fetchFollowingAllowedRedirects(startUrl: string): Promise<Response> {
  let current = startUrl;
  let redirects = 0;
  for (;;) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "manual",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!REDIRECT_STATUSES.has(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) throw new Error(`redirect with no Location header (HTTP ${res.status})`);
    const next = new URL(location, current).toString();
    // isAllowedReferenceHost relies on URL's own punycode normalisation of
    // the hostname — no separate IDN handling here.
    if (!isAllowedReferenceHost(next)) throw new Error("redirect to non-allow-listed host");

    redirects += 1;
    if (redirects > MAX_REDIRECTS) throw new Error("too many redirects");
    current = next;
  }
}

/**
 * Fetch + index each curated public page/PDF. Never throws; failures land
 * in the report. Same trust boundary as fetch_oshc_reference: allow-listed
 * hosts only, redirects followed only while every hop stays allow-listed,
 * bounded size and time. Sources whose id is no longer in the list are
 * adapter-excluded.
 */
export async function syncRegulator(): Promise<RegulatorReport> {
  const report: RegulatorReport = { results: [], errors: [] };
  for (const src of REGULATOR_SOURCES) {
    try {
      if (!isAllowedReferenceHost(src.url)) throw new Error("host not allowed");
      const res = await fetchFollowingAllowedRedirects(src.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Cheap pre-check before pulling the body into memory — the backstop
      // below (measuring the actual bytes) still applies for a server that
      // lies about, or omits, Content-Length.
      const declaredLength = res.headers.get("content-length");
      if (declaredLength && Number(declaredLength) > MAX_BYTES) {
        throw new Error(`too large (declared ${declaredLength} bytes)`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) throw new Error(`too large (${buf.byteLength} bytes)`);
      const mime = (res.headers.get("content-type") ?? "text/html").split(";")[0].trim();
      const text =
        mime === "application/pdf"
          ? await extractTextFromBuffer(buf, mime)
          : stripHtml(await extractTextFromBuffer(buf, "text/html"));
      report.results.push(
        await upsertKnowledgeSource({
          sourceKind: "regulator",
          externalId: src.id,
          title: src.title,
          category: "reference",
          tier: src.tier,
          text,
          // The citation stays the ORIGINAL list url even when a redirect
          // was followed to fetch it — that's the url a staff member would
          // recognise, and it keeps resolving after the next slug rename
          // (the fetch just follows it again next run).
          externalUrl: src.url,
        }),
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn("Knowledge: regulator source failed", { id: src.id, error });
      report.errors.push({ id: src.id, error });
    }
  }
  await excludeSources(
    { sourceKind: "regulator", externalId: { notIn: REGULATOR_SOURCES.map((s) => s.id) } },
    "adapter",
  );
  return report;
}
