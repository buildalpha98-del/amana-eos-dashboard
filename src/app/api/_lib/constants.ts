export const CENTRE_IDS = [
  "mfis-beaumont-hills",
  "mfis-greenacre",
  "mfis-hoxton-park",
  "unity-grammar",
  "arkana-college",
  "aia-kkcc",
  "al-taqwa-college",
  "minaret-officer",
  "minaret-doveton",
  "minaret-springvale",
] as const;

export type CentreId = (typeof CENTRE_IDS)[number];

export const CENTRE_NAMES: Record<CentreId, string> = {
  "mfis-beaumont-hills": "Amana OSHC MFIS Beaumont Hills",
  "mfis-greenacre": "Amana OSHC MFIS Greenacre",
  "mfis-hoxton-park": "Amana OSHC MFIS Hoxton Park",
  "unity-grammar": "Amana OSHC Unity Grammar",
  "arkana-college": "Amana OSHC Arkana College",
  "aia-kkcc": "Amana OSHC AIA KKCC",
  "al-taqwa-college": "Amana OSHC Al-Taqwa College",
  "minaret-officer": "Amana OSHC Minaret Officer",
  "minaret-doveton": "Amana OSHC Minaret Doveton",
  "minaret-springvale": "Amana OSHC Minaret Springvale",
};

export const TODO_CATEGORIES = [
  "morning-prep",
  "afternoon-prep",
  "end-of-day",
] as const;

export const ANNOUNCEMENT_TYPES = [
  "program-update",
  "newsletter-summary",
  "general",
  "holiday-quest",
  "reminder",
] as const;

export const EVENT_TYPES = [
  "excursion",
  "incursion",
  "public-holiday",
  "pupil-free",
  "term-date",
  "event",
  "holiday-quest",
] as const;
