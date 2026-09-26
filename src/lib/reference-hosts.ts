/**
 * Public hosts the assistant may fetch or index. Shared by the
 * fetch_oshc_reference tool and the regulator knowledge adapter — one
 * trust boundary. Adding a host here is a deliberate decision.
 */
export const ALLOWED_REFERENCE_HOSTS: ReadonlySet<string> = new Set([
  "acecqa.gov.au",
  "www.acecqa.gov.au",
  "nqaits.acecqa.gov.au",
  "education.gov.au",
  "www.education.gov.au",
  "education.nsw.gov.au",
  "www.education.nsw.gov.au",
  "education.vic.gov.au",
  "www.education.vic.gov.au",
  "safeworkaustralia.gov.au",
  "www.safeworkaustralia.gov.au",
  "fairwork.gov.au",
  "www.fairwork.gov.au",
  "fwc.gov.au",
  "www.fwc.gov.au",
  "legislation.gov.au",
  "www.legislation.gov.au",
  "ochre.nsw.gov.au",
  "www.ochre.nsw.gov.au",
  "esafety.gov.au",
  "www.esafety.gov.au",
  // 2026-09-27: the two safety references spec §3.3 names
  "nhmrc.gov.au", "www.nhmrc.gov.au",
  "allergy.org.au", "www.allergy.org.au",
]);

export function isAllowedReferenceHost(url: string): boolean {
  try {
    return ALLOWED_REFERENCE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
