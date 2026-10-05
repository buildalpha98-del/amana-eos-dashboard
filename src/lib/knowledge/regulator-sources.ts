/**
 * Public reference text the bot may cite. Every URL must be on a host in
 * src/lib/reference-hosts.ts (same trust boundary as fetch_oshc_reference).
 * Add a row = add a source; the monthly cron re-fetches and re-indexes
 * only when the content hash changes.
 *
 * ACECQA (acecqa.gov.au) sits behind a Cloudflare JS challenge that
 * server-side fetch cannot pass (verified 2026-09-26). The NQS guide,
 * National Regulations guide and MTOP v2.0 PDFs are loaded by an admin
 * through the manual upload in /settings/ai-knowledge instead — same
 * trust boundary, same store.
 */
import type { KnowledgeTier } from "@prisma/client";

export interface RegulatorSource {
  id: string;
  title: string;
  url: string;
  tier: KnowledgeTier;
}

export const REGULATOR_SOURCES: RegulatorSource[] = [
  { id: "nsw-regulator", title: "NSW Department of Education — Early childhood regulatory authority", url: "https://education.nsw.gov.au/early-childhood-education", tier: "general" },
  { id: "vic-regulator", title: "Victorian Department of Education — Quality Assessment and Regulation", url: "https://www.vic.gov.au/early-childhood-education-information-professionals", tier: "general" },
  { id: "fairwork-childrens-award", title: "Fair Work — Children's Services Award summary", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000120-summary", tier: "general" },
  { id: "safework-first-aid", title: "Safe Work Australia — First aid in the workplace", url: "https://www.safeworkaustralia.gov.au/safety-topic/managing-health-and-safety/first-aid", tier: "safety_critical" },
  { id: "nhmrc-staying-healthy", title: "NHMRC — Staying Healthy: preventing infectious diseases in early childhood (exclusion periods)", url: "https://www.nhmrc.gov.au/about-us/publications/staying-healthy-guidelines", tier: "safety_critical" },
  { id: "ascia-action-plans", title: "ASCIA — Action plans for anaphylaxis and allergic reactions", url: "https://www.allergy.org.au/hp/anaphylaxis/ascia-action-plan-for-anaphylaxis", tier: "safety_critical" },
];
