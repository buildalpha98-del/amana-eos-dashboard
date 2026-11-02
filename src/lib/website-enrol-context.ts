/** Public website hints are presentation only, never proof of service access. */
export const WEBSITE_CENTRES: Record<string, string> = {
  "mfis-greenacre": "MFIS Greenacre",
  "mfis-hoxton-park": "MFIS Hoxton Park",
  "mfis-beaumont-hills": "MFIS Beaumont Hills",
  "unity-grammar": "Unity Grammar",
  "arkana-college": "Arkana College",
  "minarah-college": "Minarah College",
  "al-taqwa-college": "Al-Taqwa College",
  "minaret-officer": "Minaret College Officer",
  "minaret-springvale": "Minaret College Springvale",
  "minaret-doveton": "Minaret College Doveton",
  "aia-kkcc": "AIA KKCC",
};
export const WEBSITE_CONTEXT_KEY = "amana_website_enrol_context";

export const WEBSITE_PROGRAMS: Record<string, string> = {
  "holiday-quest": "Holiday Quest",
  "al-hafiz": "Al Hafiz program",
};

/** The website context this browser arrived with (URL first, then session). */
export function readWebsiteEnrolContext(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const incoming = websiteEnrolContext(new URLSearchParams(window.location.search));
  if (incoming.size) return incoming;
  try {
    return websiteEnrolContext(new URLSearchParams(sessionStorage.getItem(WEBSITE_CONTEXT_KEY) ?? ""));
  } catch {
    return new URLSearchParams();
  }
}
export function websiteEnrolContext(params: URLSearchParams): URLSearchParams {
  const clean = new URLSearchParams();
  const centre = params.get("centre") ?? "";
  if (Object.hasOwn(WEBSITE_CENTRES, centre)) clean.set("centre", centre);
  if (params.get("program") === "holiday-quest")
    clean.set("program", "holiday-quest");
  // Al Hafiz runs at MFIS Greenacre only — ignore it for any other centre.
  if (params.get("program") === "al-hafiz" && centre === "mfis-greenacre")
    clean.set("program", "al-hafiz");
  return clean;
}
