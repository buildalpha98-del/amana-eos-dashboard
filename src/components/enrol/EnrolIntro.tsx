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
import { ChevronRight, Globe, School } from "lucide-react";
import {
  KNOWN_SCHOOLS,
  KNOWN_SCHOOL_OPTIONS,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "./types";

interface Props {
  initialLocale: SupportedLocale;
  /** Pre-selected school, so returning here from the wizard keeps the choice. */
  initialSchool?: string;
  onContinue: (locale: SupportedLocale, school: string) => void;
  /** Neutral bg for parent-portal embedding; dark bg for standalone. */
  variant?: "standalone" | "portal";
  /** Shown when the parent came BACK here from inside the wizard. */
  isReturning?: boolean;
  /** Dismiss without changing anything — only offered when returning. */
  onCancel?: () => void;
}

export function EnrolIntro({
  initialLocale,
  initialSchool = "",
  onContinue,
  variant = "standalone",
  isReturning = false,
  onCancel,
}: Props) {
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);
  const selected = SUPPORTED_LOCALES.find((l) => l.code === locale);
  const showDisclaimer = selected && !selected.ready;

  // School: the <select> holds either a known option, "" (unset), or the
  // "__other" sentinel which reveals a free-text input. `school` always
  // holds the value we actually submit.
  const [school, setSchool] = useState(initialSchool);
  const [otherPicked, setOtherPicked] = useState(
    Boolean(initialSchool) && !KNOWN_SCHOOL_OPTIONS.includes(initialSchool),
  );
  const selectValue = otherPicked
    ? "__other"
    : KNOWN_SCHOOL_OPTIONS.includes(school)
      ? school
      : "";
  const canContinue = school.trim().length > 0;

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
            {isReturning ? "Change your details" : "Welcome"}
          </h1>
          <p className="text-sm text-white/85">
            {isReturning
              ? "Update your language or your child's school. Everything you've already filled in is kept."
              : "Before we start your child's enrolment, please choose your preferred language and your child's school."}
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

          {/* School — prefills the first child's school in Step 1, where it
              can still be changed (and set individually for siblings at
              different schools). */}
          <div>
            <label
              htmlFor="intro-school"
              className="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
            >
              <School className="w-4 h-4 text-brand" />
              Which school does your child attend?
            </label>
            <select
              id="intro-school"
              value={selectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__other") {
                  setOtherPicked(true);
                  setSchool("");
                } else {
                  setOtherPicked(false);
                  setSchool(v);
                }
              }}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            >
              <option value="">Select school...</option>
              {KNOWN_SCHOOLS.map((s) =>
                s.campuses.length === 0 ? (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ) : (
                  <optgroup key={s.name} label={s.name}>
                    {s.campuses.map((c) => (
                      <option key={c} value={`${s.name} ${c}`}>
                        {c}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
              <option value="__other">Other school…</option>
            </select>
            {otherPicked && (
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="Type your child's school"
                autoFocus
                className="mt-2 w-full px-3 py-2.5 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            )}
            <p className="mt-1 text-xs text-muted">
              You can change this, or set a different school per child, on the
              next step.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            {isReturning && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="sm:flex-1 inline-flex items-center justify-center px-4 py-3 rounded-lg border border-border text-foreground/80 font-medium hover:bg-surface transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => onContinue(locale, school.trim())}
              disabled={!canContinue}
              title={
                canContinue ? undefined : "Choose your child's school to continue"
              }
              className="sm:flex-[2] w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-medium px-4 py-3 rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReturning ? "Save and continue" : "Continue"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-2xs text-muted text-center">
            Your progress is saved in this browser as you go — you can close
            this tab and finish later.
          </p>
        </div>
      </div>
    </div>
  );
}
