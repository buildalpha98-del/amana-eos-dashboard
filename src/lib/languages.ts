/**
 * Preferred languages — ONE list for the enrolment form, the family's
 * CentreContact, email audiences and the per-centre language breakdown.
 *
 * Daniel, 2026-10-06: the primary parent picks the language they'd like to
 * hear from us in; marketing material and information packs go out in that
 * language where we have a version, and the per-centre mix tells marketing
 * which languages to produce material in for each school. Stored values are
 * these exact labels.
 */
export const PREFERRED_LANGUAGES = [
  "English",
  "Arabic",
  "Urdu",
  "Turkish",
  "Bangla",
  "Somali",
  "Pashto",
  "Dari / Persian",
  "Hindi",
  "Indonesian",
  "Malay",
  "Vietnamese",
  "Chinese (Mandarin)",
  "Chinese (Cantonese)",
  "Filipino (Tagalog)",
  "Samoan",
  "Other",
] as const;

export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

export function isPreferredLanguage(v: unknown): v is PreferredLanguage {
  return typeof v === "string" && (PREFERRED_LANGUAGES as readonly string[]).includes(v);
}

/**
 * Best-effort mapping from free text ("Arabic and English", "urdu") to a
 * list value. Used for families who enrolled before the dropdown existed,
 * whose only signal is "language spoken at home". Order matters: the first
 * non-English language mentioned wins, because "English and Arabic" at home
 * says more about who to send Arabic material to than about English.
 */
export function languageFromText(text: unknown): PreferredLanguage | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const t = text.toLowerCase();
  const rules: [RegExp, PreferredLanguage][] = [
    [/arab/, "Arabic"],
    [/urdu/, "Urdu"],
    [/turk/, "Turkish"],
    [/bangla|bengali/, "Bangla"],
    [/somal/, "Somali"],
    [/pasht|pusht/, "Pashto"],
    [/dari|farsi|persian/, "Dari / Persian"],
    [/hindi/, "Hindi"],
    [/indones|bahasa/, "Indonesian"],
    [/malay/, "Malay"],
    [/vietnam/, "Vietnamese"],
    [/mandarin/, "Chinese (Mandarin)"],
    [/cantonese/, "Chinese (Cantonese)"],
    [/tagalog|filipin/, "Filipino (Tagalog)"],
    [/samoa/, "Samoan"],
  ];
  for (const [re, lang] of rules) if (re.test(t)) return lang;
  if (/english/.test(t)) return "English";
  return "Other";
}
