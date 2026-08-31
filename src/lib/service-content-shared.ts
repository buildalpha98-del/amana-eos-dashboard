/**
 * Per-service editable content — types, defaults, Zod validators.
 * Browser-safe (no Prisma imports); server helpers live alongside in
 * `service-content.ts`.
 *
 * Each service has an optional `content` JSON column holding the
 * customised slice. Missing fields fall back to the defaults below so
 * services that haven't been edited render identically to today.
 *
 * 2026-05-16: introduced as part of the per-service-content rollout.
 */

import { z } from "zod";

const contactSchema = z.object({
  /** Display label shown next to the contact, e.g. "Director of Service". */
  role: z.string().min(1).max(80),
  /** Person's name; empty string means "not yet assigned" — hidden in view mode. */
  name: z.string().max(120),
  /** Australian phone format isn't strictly enforced here — admins paste
   *  whatever they prefer. Empty string means no phone shown. */
  phone: z.string().max(40),
  /** Optional email. Empty string = hidden. */
  email: z.string().max(120),
});

export const serviceContentSchema = z.object({
  /** Welcome / About narrative for parents and staff. Plain text, multi-line. */
  about: z.string().max(4_000),
  /** "Why families love us" hero subtitle. Single line. */
  tagline: z.string().max(280),
  /** Hero image URL (relative or absolute). Uploads land in
   *  /uploads/content/ via the existing /api/content-uploads endpoint. */
  heroImage: z.string().max(2_048),
  /** Key contacts shown on parent-facing surfaces + the service detail page. */
  contacts: z.array(contactSchema).max(8),
  /** Daily routine narrative — what the rhythm at THIS centre looks like.
   *  Plain text, multi-line. Falls back to the LMS / Amana Way default
   *  rhythm when unset. */
  dailyRoutine: z.string().max(4_000),
  /** Food provider + dietary policies (halal, allergens, etc.). */
  foodProvider: z.string().max(1_000),
  /** Parent onboarding walkthrough text — what new families can expect. */
  parentOnboarding: z.string().max(4_000),

  // ── 2026-08-04: the fields the My Centre tab needs ──────────────────
  /**
   * Where in the school the service actually is — "Hall, next to the
   * canteen. Enter via Gate 3." A street address gets a parent to the
   * school; it doesn't get them to us.
   */
  locationWithinSchool: z.string().max(600),
  /** Where families meet us at drop-off and pick-up. */
  meetingPoints: z.string().max(1_000),
  /** Vision statement, shown under the welcome text. */
  vision: z.string().max(1_000),
  /**
   * A map of where the service sits inside the school. Image or PDF —
   * images get a tappable preview, PDFs open in a new tab, because
   * rendering a PDF thumbnail needs a renderer we don't have and a
   * parent at the gate wants the picture immediately.
   */
  serviceMapUrl: z.string().max(2_048),
  serviceMapName: z.string().max(200),
  /**
   * Which policies apply HERE, as Document ids.
   *
   * Selected rather than "every policy for this centre" because the
   * library is jurisdiction-wide: showing a Sydney family a Victorian
   * regulation is worse than showing them nothing. The document itself
   * stays in the library, so updating it there updates it everywhere.
   */
  policyDocumentIds: z.array(z.string().min(1)).max(50),
});

export type ServiceContent = z.infer<typeof serviceContentSchema>;

export const SERVICE_CONTENT_DEFAULTS: ServiceContent = {
  about: "",
  tagline: "",
  heroImage: "",
  contacts: [],
  dailyRoutine: "",
  foodProvider: "",
  parentOnboarding: "",
  locationWithinSchool: "",
  meetingPoints: "",
  vision: "",
  serviceMapUrl: "",
  serviceMapName: "",
  policyDocumentIds: [],
};

/**
 * Permissive read merger — drops invalid types silently and falls back to
 * the default for that field. Strict validation happens at the write
 * boundary (the PATCH route).
 */
export function mergeServiceContent(
  partial: unknown,
  defaults: ServiceContent = SERVICE_CONTENT_DEFAULTS,
): ServiceContent {
  const safe = (partial && typeof partial === "object" ? partial : {}) as Record<
    string,
    unknown
  >;
  const str = (k: keyof ServiceContent): string =>
    typeof safe[k] === "string" ? (safe[k] as string) : (defaults[k] as string);

  const contactsRaw = Array.isArray(safe.contacts) ? safe.contacts : [];
  const contacts = contactsRaw
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const obj = c as Record<string, unknown>;
      return {
        role: typeof obj.role === "string" ? obj.role : "",
        name: typeof obj.name === "string" ? obj.name : "",
        phone: typeof obj.phone === "string" ? obj.phone : "",
        email: typeof obj.email === "string" ? obj.email : "",
      };
    })
    .slice(0, 8);

  const policyDocumentIds = (
    Array.isArray(safe.policyDocumentIds) ? safe.policyDocumentIds : []
  )
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 50);

  return {
    about: str("about"),
    tagline: str("tagline"),
    heroImage: str("heroImage"),
    contacts,
    dailyRoutine: str("dailyRoutine"),
    foodProvider: str("foodProvider"),
    parentOnboarding: str("parentOnboarding"),
    locationWithinSchool: str("locationWithinSchool"),
    meetingPoints: str("meetingPoints"),
    vision: str("vision"),
    serviceMapUrl: str("serviceMapUrl"),
    serviceMapName: str("serviceMapName"),
    policyDocumentIds,
  };
}
