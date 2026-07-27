"use client";

/**
 * Enrolment-form translations — client-side hook + English source of truth.
 *
 * The public parent enrolment form (`/enrol`, `/enrol/[token]`) can render
 * in any of the languages listed in `SUPPORTED_LOCALES` in
 * `src/components/enrol/types.ts`. Non-English strings are stored in the
 * `EnrolFormTranslation` DB table and edited by staff via
 * `/settings/enrol-translations` (Phase 3). Missing rows fall back to the
 * English source below.
 *
 * Adding a new string:
 *   1. Add it to `ENROL_STRINGS_EN` below with a stable dotted key.
 *   2. Reference it in the component via `const t = useT(); t("your.key")`.
 *   3. Seed AI translations by running the seed script (Phase 2 follow-up)
 *      or leave it to fall back to English until a staff member fills it.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { SupportedLocale } from "@/components/enrol/types";

/**
 * Canonical English strings. Keys use `step.field.subfield` dotted notation
 * so they group naturally in the admin editor. Adding a key here without
 * an accompanying translation just means non-English locales see the
 * English default — no error, no missing content.
 */
export const ENROL_STRINGS_EN = {
  // ── Wizard shell (progress bar, buttons, banners) ────────────────
  "wizard.step.children": "Child Details",
  "wizard.step.parents": "Parent / Guardian",
  "wizard.step.medical": "Medical",
  "wizard.step.emergency": "Emergency Contacts",
  "wizard.step.consents": "Consents",
  "wizard.step.booking": "Booking",
  "wizard.step.payment": "Payment",
  "wizard.step.review": "Review & Submit",
  "wizard.button.back": "Back",
  "wizard.button.next": "Next",
  "wizard.button.submit": "Submit enrolment",
  "wizard.button.submitting": "Submitting…",
  "wizard.button.startOver": "Start over",
  "wizard.button.resume": "Resume",
  "wizard.button.discard": "Discard and start fresh",
  "wizard.banner.translationPreview":
    "translation coming soon. The form is showing in English for now. If anything is unclear, contact us on enrolments@amanaoshc.com.au.",
  "wizard.banner.savedProgress":
    "We saved your progress in this browser. Continue where you left off?",
  "wizard.error.title": "Please fix the following before continuing:",
  "wizard.submitError.title": "We couldn't submit your enrolment",
  "wizard.success.title": "Enrolment received",
  "wizard.success.subtitle":
    "Thank you — we've received your enrolment for {childNames}. Our team will be in touch shortly.",

  // ── Intro screen ──────────────────────────────────────────────
  "intro.brand": "Amana OSHC",
  "intro.heading": "Welcome",
  "intro.subheading":
    "Before we start your child's enrolment, please choose your preferred language.",
  "intro.language.label": "Preferred language",
  "intro.language.preview": "Preview",
  "intro.language.disclaimer":
    "Preview language. The form will show in English while we finalise the {language} translation. If anything is unclear, contact us on enrolments@amanaoshc.com.au.",
  "intro.button.continue": "Continue",
  "intro.footer.saveHint":
    "Your progress is saved in this browser as you go — you can close this tab and finish later.",
} as const;

export type EnrolTranslationKey = keyof typeof ENROL_STRINGS_EN;

/**
 * Fetch the translation map for a given locale. Cached for 10 minutes —
 * translations don't change during a single enrolment session.
 */
export function useEnrolTranslations(locale: SupportedLocale) {
  return useQuery<Record<string, string>>({
    queryKey: ["enrol-translations", locale],
    queryFn: () =>
      fetchApi<Record<string, string>>(
        `/api/enrol/translations?locale=${locale}`,
      ),
    staleTime: 10 * 60 * 1000,
    // English is our source of truth — no need to fetch anything for it.
    enabled: locale !== "en",
  });
}

/**
 * The `t()` translator. Pass in the fetched translations map (or undefined
 * when the query is still loading / when locale is English). Substitutes
 * `{placeholder}` tokens from `vars`.
 */
export function makeT(
  translations: Record<string, string> | undefined,
  locale: SupportedLocale,
) {
  return function t(
    key: EnrolTranslationKey,
    vars?: Record<string, string | number>,
  ): string {
    const source =
      locale === "en"
        ? ENROL_STRINGS_EN[key]
        : (translations?.[key] ?? ENROL_STRINGS_EN[key]);
    if (!vars) return source;
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      source,
    );
  };
}

/**
 * Convenience — combines the fetch + the translator. Use this in components:
 *
 *   const { t } = useT(locale);
 *   <h1>{t("intro.heading")}</h1>
 */
export function useT(locale: SupportedLocale) {
  const { data: translations } = useEnrolTranslations(locale);
  return { t: makeT(translations, locale), loading: locale !== "en" && !translations };
}
