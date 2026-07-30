"use client";

/**
 * /parent/enrol — the in-portal enrolment form.
 *
 * 2026-07-30, Phase 2. Replaces the anonymous public form for
 * account-holders: the enrolment is owned by their account and autosaves
 * to it, so leaving mid-way and coming back (even on another device)
 * resumes exactly where they were.
 *
 * Steps 2-5 (Child, Contacts, Billing, Agreement) are stubbed with their
 * headings so the progress bar is honest about what's coming; they're the
 * next commit. The Me step is fully wired.
 */

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Cloud, CloudOff, User, Baby, Phone, CreditCard, ClipboardCheck } from "lucide-react";
import { useEnrolmentDraft, type DraftData } from "@/hooks/useEnrolmentDraft";
import { ENROL_STEPS } from "./steps";
import { MeStep, type MeData } from "./MeStep";
import { ccsAnswered } from "@/lib/enrol-ccs";

const STEP_ICONS = [User, Baby, Phone, CreditCard, ClipboardCheck];

export default function ParentEnrolPage() {
  const { initialData, initialStep, isLoading, save, saveState } =
    useEnrolmentDraft();

  // Overlay rather than hydrate. Copying the loaded draft into state via
  // an effect means setState-during-effect (which the hooks lint rejects)
  // AND a race where a slow query can clobber what's already been typed.
  // Instead the saved draft is the base and local edits sit on top, so
  // before the first keystroke `form` simply IS the saved draft.
  const [edits, setEdits] = useState<DraftData | null>(null);
  const [stepOverride, setStepOverride] = useState<number | null>(null);
  const form = edits ?? initialData;
  const step = stepOverride ?? initialStep;

  const me = (form.me ?? {}) as MeData;

  const patchMe = (patch: Partial<MeData>) => {
    setEdits((prev) => {
      const base = prev ?? initialData;
      const next = { ...base, me: { ...(base.me as MeData), ...patch } };
      save(next, step);
      return next;
    });
  };

  const meComplete = useMemo(
    () =>
      Boolean(
        me.firstName?.trim() &&
          me.surname?.trim() &&
          me.mobile?.trim() &&
          me.dob &&
          me.street?.trim() &&
          me.suburb?.trim() &&
          me.isLegalCarer &&
          ccsAnswered({
            approved: me.ccsApproved ?? null,
            applied: me.ccsApplied ?? null,
          }),
      ),
    [me],
  );

  const goTo = (next: number) => {
    setStepOverride(next);
    save(form, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {ENROL_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i];
            const done = i < step;
            const current = i === step;
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center relative">
                {i > 0 && (
                  <span className="absolute top-5 right-1/2 w-full border-t border-dashed border-border -z-10" />
                )}
                <button
                  type="button"
                  onClick={() => i <= step && goTo(i)}
                  disabled={i > step}
                  className={
                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors " +
                    (current
                      ? "bg-brand text-white"
                      : done
                        ? "bg-brand/10 text-brand border border-brand"
                        : "bg-card text-muted border border-border") +
                    (i <= step ? " cursor-pointer" : " cursor-default")
                  }
                  aria-current={current ? "step" : undefined}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </button>
                <span className={
                  "mt-2 text-xs font-medium " +
                  (current ? "text-brand" : "text-muted")
                }>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-heading font-semibold text-foreground">
          {ENROL_STEPS[step].title}
        </h1>
        {/* Autosave status — quiet, never a blocking error. */}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          {saveState === "saving" && (<><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>)}
          {saveState === "saved" && (<><Cloud className="w-3 h-3" /> Saved</>)}
          {saveState === "error" && (<><CloudOff className="w-3 h-3 text-amber-600" /> Not saved — we&apos;ll retry</>)}
        </span>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 sm:p-6">
        {step === 0 ? (
          <MeStep data={me} onChange={patchMe} />
        ) : (
          <p className="text-sm text-muted py-8 text-center">
            The {ENROL_STEPS[step].label} step is coming next. Your progress
            so far is saved.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={() => goTo(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-foreground/80 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => goTo(Math.min(ENROL_STEPS.length - 1, step + 1))}
          disabled={step === 0 && !meComplete}
          title={step === 0 && !meComplete ? "Please complete the required fields" : undefined}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <p className="text-center text-xs text-muted mt-4">
        Your answers save automatically. You can close this and come back
        any time — we&apos;ll pick up where you left off.
      </p>
    </div>
  );
}
