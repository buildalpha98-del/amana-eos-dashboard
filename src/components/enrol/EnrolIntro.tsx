"use client";

/**
 * EnrolIntro — welcome screen shown before the enrolment wizard.
 *
 * 2026-07-27: adds an initial step so parents pick their preferred
 * language before filling in child details. Only English is fully
 * translated for now; other locales fall back to English content with
 * an "AI-translated, work in progress" disclaimer banner (Phase 2 seeds
 * actual translations; Phase 3 adds a dashboard editor for staff).
 *
 * When the parent clicks Continue, the caller marks `introCompleted`
 * in form state and the wizard renders. On refresh, `introCompleted`
 * comes back from localStorage so we don't re-show this screen.
 */

import { useState } from "react";
import { ChevronRight, Globe } from "lucide-react";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./types";

interface Props {
  initialLocale: SupportedLocale;
  onContinue: (locale: SupportedLocale) => void;
  /** Neutral bg for parent-portal embedding; dark bg for standalone. */
  variant?: "standalone" | "portal";
}

export function EnrolIntro({
  initialLocale,
  onContinue,
  variant = "standalone",
}: Props) {
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);
  const selected = SUPPORTED_LOCALES.find((l) => l.code === locale);
  const showDisclaimer = selected && !selected.ready;

  const outerBg =
    variant === "portal"
      ? "bg-surface"
      : "bg-gradient-to-br from-[color:var(--color-brand)] to-[#003344]";

  return (
    <div
      className={`min-h-[100dvh] ${outerBg} flex items-center justify-center p-4 sm:p-8`}
    >
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[color:var(--color-brand)] text-white p-6 sm:p-8 text-center">
          <p className="text-xs uppercase tracking-widest text-[color:var(--color-accent)] mb-2">
            Amana OSHC
          </p>
          <h1 className="text-2xl sm:text-3xl font-heading font-semibold mb-2">
            Welcome
          </h1>
          <p className="text-sm text-white/85">
            Before we start your child&apos;s enrolment, please choose your
            preferred language.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
              <Globe className="w-4 h-4 text-brand" />
              Preferred language
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_LOCALES.map((l) => {
                const active = l.code === locale;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLocale(l.code)}
                    className={
                      "text-left rounded-lg border px-3 py-2.5 transition-colors " +
                      (active
                        ? "border-brand bg-brand/5 text-foreground"
                        : "border-border bg-card hover:border-brand/40 text-foreground/80")
                    }
                    aria-pressed={active}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div
                          className="text-sm font-medium truncate"
                          dir={l.dir}
                        >
                          {l.nativeLabel}
                        </div>
                        <div className="text-2xs text-muted truncate">
                          {l.label}
                        </div>
                      </div>
                      {!l.ready && (
                        <span className="text-2xs uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 shrink-0">
                          Preview
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {showDisclaimer && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                <strong>Preview language.</strong> The form will show in
                English while we finalise the {selected.label} translation.
                If anything is unclear, contact us on{" "}
                <a
                  href="mailto:enrolments@amanaoshc.com.au"
                  className="underline"
                >
                  enrolments@amanaoshc.com.au
                </a>
                .
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => onContinue(locale)}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-medium px-4 py-3 rounded-lg hover:bg-brand/90 transition-colors"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>

          <p className="text-2xs text-muted text-center">
            Your progress is saved in this browser as you go — you can close
            this tab and finish later.
          </p>
        </div>
      </div>
    </div>
  );
}
