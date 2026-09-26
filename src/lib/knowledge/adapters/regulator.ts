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
 * Fetch + index each curated public page/PDF. Never throws; failures land
 * in the report. Same trust boundary as fetch_oshc_reference: allow-listed
 * hosts only, no cross-host redirects, bounded size and time. Sources whose
 * id is no longer in the list are adapter-excluded.
 */
export async function syncRegulator(): Promise<RegulatorReport> {
  const report: RegulatorReport = { results: [], errors: [] };
  for (const src of REGULATOR_SOURCES) {
    try {
      if (!isAllowedReferenceHost(src.url)) throw new Error("host not allowed");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        // redirect: "error" keeps the SSRF property (no cross-host hops) at the
        // cost of treating a 301 (http→https, trailing slash, a site move) as a
        // failure. Those land in the run report; fix the URL in the list rather
        // than following redirects. Slice 2 may add a follow-once-if-allow-listed loop.
        res = await fetch(src.url, {
          headers: { "User-Agent": "AmanaOSHC-KnowledgeBot/1.0" },
          redirect: "error",
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
