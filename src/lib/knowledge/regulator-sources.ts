/**
 * Public reference text the bot may cite. Every URL must be on a host in
 * src/lib/reference-hosts.ts (same trust boundary as fetch_oshc_reference).
 * Add a row = add a source; the monthly cron re-fetches and re-indexes
 * only when the content hash changes.
 */
import type { KnowledgeTier } from "@prisma/client";

export interface RegulatorSource {
  id: string;
  title: string;
  url: string;
  tier: KnowledgeTier;
}

export const REGULATOR_SOURCES: RegulatorSource[] = [
  { id: "acecqa-nqs", title: "ACECQA — National Quality Standard", url: "https://www.acecqa.gov.au/nqf/national-quality-standard", tier: "general" },
  { id: "acecqa-law-regs", title: "ACECQA — National Law and Regulations", url: "https://www.acecqa.gov.au/nqf/national-law-regulations", tier: "general" },
  { id: "acecqa-mtop", title: "ACECQA — My Time, Our Place V2.0 (framework)", url: "https://www.acecqa.gov.au/nqf/national-law-regulations/approved-learning-frameworks", tier: "general" },
  { id: "acecqa-ratios", title: "ACECQA — Educator to child ratios", url: "https://www.acecqa.gov.au/nqf/educator-to-child-ratios", tier: "safety_critical" },
  { id: "acecqa-quals", title: "ACECQA — Qualifications for OSHC educators", url: "https://www.acecqa.gov.au/qualifications/requirements/children-over-preschool-age", tier: "general" },
  { id: "acecqa-incident", title: "ACECQA — Serious incidents and notifications", url: "https://www.acecqa.gov.au/resources/applications/notifications", tier: "safety_critical" },
  { id: "nsw-regulator", title: "NSW Department of Education — Early childhood regulatory authority", url: "https://www.education.nsw.gov.au/early-childhood-education", tier: "general" },
  { id: "vic-regulator", title: "Victorian Department of Education — Quality Assessment and Regulation", url: "https://www.education.vic.gov.au/childhood/providers/regulation/Pages/default.aspx", tier: "general" },
  { id: "fairwork-childrens-award", title: "Fair Work — Children's Services Award summary", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000120-summary", tier: "general" },
  { id: "safework-first-aid", title: "Safe Work Australia — First aid in the workplace", url: "https://www.safeworkaustralia.gov.au/safety-topic/managing-health-and-safety/first-aid", tier: "safety_critical" },
  { id: "nhmrc-staying-healthy", title: "NHMRC — Staying Healthy: preventing infectious diseases in early childhood (exclusion periods)", url: "https://www.nhmrc.gov.au/about-us/publications/staying-healthy-preventing-infectious-diseases-early-childhood-education-and-care-services", tier: "safety_critical" },
  { id: "ascia-action-plans", title: "ASCIA — Action plans for anaphylaxis and allergic reactions", url: "https://www.allergy.org.au/hp/anaphylaxis/ascia-action-plan-for-anaphylaxis", tier: "safety_critical" },
];
