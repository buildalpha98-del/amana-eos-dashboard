/**
 * What the website (amanaoshc.com.au) already publishes for each centre —
 * the starting point for the parent welcome email, so it's school-specific
 * from day one without anyone typing it in.
 *
 * Anything here is overridden by the centre's own Content tab
 * (ServiceContent.welcome*), which is where changes should be made. Keep
 * this in step with the website's src/lib/centres.ts when coordinators
 * change; the dashboard field wins either way.
 *
 * Keyed by Service.code.
 */
export const WEBSITE_ORIGIN = "https://amanaoshc.com.au";

export const CENTRE_WEBSITE_SLUGS: Record<string, string> = {
  "MFIS-GA": "mfis-greenacre",
  "MFIS-HP": "mfis-hoxton-park",
  "MFIS-BH": "mfis-beaumont-hills",
  UG: "unity-grammar",
  ARK: "arkana-college",
  MNC: "minarah-college",
  IRF: "irfan-college",
  AICS: "aics",
  ATC: "al-taqwa-college",
  "MIN-OFF": "minaret-officer",
  "MIN-SPR": "minaret-springvale",
  "MIN-DOV": "minaret-doveton",
  "AIA-COB": "aia-kkcc",
};

/** Coordinators as published on each centre page (website, 13 Oct 2026). */
const WEBSITE_COORDINATORS: Record<string, string> = {
  "mfis-greenacre": "Sarah Awad",
  "mfis-hoxton-park": "Tamjid Rahman",
  "mfis-beaumont-hills": "Saba",
  "unity-grammar": "Lena",
  "arkana-college": "Salma Diab",
  "minarah-college": "Nadia",
  "al-taqwa-college": "Fatema Rasool",
  "minaret-officer": "Lami Hopman",
  "minaret-springvale": "Rifka",
  "minaret-doveton": "Khawla Sadat",
  "aia-kkcc": "Thushy",
};

/** Centres with a published welcome pack PDF on the website. */
const WELCOME_PACK_SLUGS = new Set([
  "aia-kkcc",
  "al-taqwa-college",
  "arkana-college",
  "mfis-beaumont-hills",
  "mfis-greenacre",
  "mfis-hoxton-park",
  "minarah-college",
  "minaret-doveton",
  "minaret-officer",
  "minaret-springvale",
  "unity-grammar",
]);

/** First-session tips used when a centre hasn't written its own. */
export const DEFAULT_FIRST_SESSION_TIPS = [
  "Bookings and fees are managed in OWNA. Watch for your OWNA invitation and book your sessions there.",
  "An authorised adult signs your child in and out at every session.",
  "Tell us about any medical needs, medication or changes before the first day.",
  "Pop your child's name on their bag, hat and drink bottle.",
];

export interface CentreWelcomeDefaults {
  coordinatorName: string | null;
  coordinatorPhoto: string | null;
  welcomePackUrl: string | null;
  centrePageUrl: string | null;
}

export function centreWelcomeDefaults(serviceCode: string | null | undefined): CentreWelcomeDefaults {
  const slug = serviceCode ? CENTRE_WEBSITE_SLUGS[serviceCode] : undefined;
  if (!slug) return { coordinatorName: null, coordinatorPhoto: null, welcomePackUrl: null, centrePageUrl: null };
  const coordinatorName = WEBSITE_COORDINATORS[slug] ?? null;
  return {
    coordinatorName,
    coordinatorPhoto: coordinatorName ? `${WEBSITE_ORIGIN}/centres/${slug}/coordinator.jpg` : null,
    welcomePackUrl: WELCOME_PACK_SLUGS.has(slug)
      ? `${WEBSITE_ORIGIN}/welcome-packs/amana-oshc-welcome-pack-${slug}.pdf`
      : null,
    centrePageUrl: `${WEBSITE_ORIGIN}/centres/${slug}`,
  };
}
