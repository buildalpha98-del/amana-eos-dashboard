"use client";

/**
 * /parent/enrol — the in-portal enrolment form.
 *
 * 2026-07-30, Phase 2. Replaces the anonymous public form for
 * account-holders: the enrolment is owned by their account and autosaves
 * to it, so leaving mid-way and coming back (even on another device)
 * resumes exactly where they were.
 *
 * All five steps are live. Completeness rules live in
 * src/lib/enrol-draft.ts and are shared with the submit route, so the
 * button and the server can't disagree about what "finished" means.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Cloud,
  CloudOff,
  User,
  Baby,
  Phone,
  CreditCard,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import { useEnrolmentDraft } from "@/hooks/useEnrolmentDraft";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { ENROL_STEPS } from "./steps";
import { MeStep, type MeData } from "./MeStep";
import { ChildStep } from "./ChildStep";
import { ContactsStep } from "./ContactsStep";
import {
  BillingStep,
  EMPTY_PAYMENT,
  paymentEntered,
  type PaymentEntry,
} from "./BillingStep";
import { AgreementStep } from "./AgreementStep";
import {
  stepComplete,
  stepBlocker,
  draftSubmittable,
  type DraftAgreement,
  type DraftBilling,
  type DraftChild,
  type DraftContacts,
  type EnrolDraft,
} from "@/lib/enrol-draft";

const STEP_ICONS = [User, Baby, Phone, CreditCard, ClipboardCheck];
const LAST_STEP = ENROL_STEPS.length - 1;

export default function ParentEnrolPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { initialData, initialStep, isLoading, save, flush, saveState } =
    useEnrolmentDraft();

  // Overlay rather than hydrate. Copying the loaded draft into state via
  // an effect means setState-during-effect (which the hooks lint rejects)
  // AND a race where a slow query can clobber what's already been typed.
  // Instead the saved draft is the base and local edits sit on top, so
  // before the first keystroke `form` simply IS the saved draft.
  const [edits, setEdits] = useState<EnrolDraft | null>(null);
  const [stepOverride, setStepOverride] = useState<number | null>(null);
  const form: EnrolDraft = (edits ?? initialData) as EnrolDraft;
  const step = stepOverride ?? initialStep;

  // Payment lives OUTSIDE the draft on purpose — never autosaved. See the
  // header comment in BillingStep.tsx.
  const [payment, setPayment] = useState<PaymentEntry>(EMPTY_PAYMENT);
  const [submitting, setSubmitting] = useState(false);

  const patch = (p: Partial<EnrolDraft>) => {
    setEdits((prev) => {
      const base = prev ?? (initialData as EnrolDraft);
      const next = { ...base, ...p };
      save(next as Record<string, unknown>, step);
      return next;
    });
  };

  const children = form.children ?? [{}];

  const canAdvance = stepComplete(step, form);
  // On the last step the blocker also has to account for payment, which
  // lives outside the draft.
  const blocker =
    step === LAST_STEP
      ? submitting
        ? null
        : !stepComplete(4, form)
          ? stepBlocker(4, form)
          : !paymentEntered(payment)
            ? "Please go back to Billing and enter your payment details — they aren't saved between visits."
            : !draftSubmittable(form)
              ? "Some earlier steps are incomplete. Use the circles above to go back and finish them."
              : null
      : stepBlocker(step, form);
  const canSubmit =
    draftSubmittable(form) && paymentEntered(payment) && !submitting;

  const goTo = (next: number) => {
    setStepOverride(next);
    save(form as Record<string, unknown>, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      // Make sure the last keystroke is on the server before we ask it to
      // validate what's there — the debounce would otherwise still be in
      // flight and the submit would fail on stale data.
      await flush();
      await mutateApi("/api/parent/enrolment-draft/submit", {
        method: "POST",
        body: { payment },
      });
      // The gate in ParentShell reads this; without invalidating, they'd be
      // bounced straight back into the form they just submitted.
      await queryClient.invalidateQueries({ queryKey: ["parent", "state"] });
      toast({
        description:
          "Enrolment submitted. We'll be in touch once our team has reviewed it.",
      });
      router.replace("/parent/children");
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error
            ? err.message
            : "We couldn't submit your enrolment. Please try again.",
      });
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6">
      {/* Progress */}
      <div className="mb-8 overflow-hidden">
        <div className="flex items-center justify-between">
          {ENROL_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i];
            // Completeness, not position: with free navigation a parent
            // can be on step 4 with step 2 still unfinished, and a tick
            // there would be a lie.
            const done = stepComplete(i, form);
            const current = i === step;
            return (
              <div key={s.key} className="flex-1 min-w-0 px-0.5 flex flex-col items-center relative">
                {i > 0 && (
                  <span className="absolute top-5 right-1/2 w-full border-t border-dashed border-border z-0" />
                )}
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className={
                    // 44px square, NOT smaller: globals.css forces
                    // min-height:44px on every button under pointer:coarse,
                    // so anything shorter renders as an oval on a phone.
                    "w-11 h-11 rounded-full flex items-center justify-center transition-colors shrink-0 relative z-10 " +
                    (current
                      ? "bg-brand text-white"
                      : done
                        ? "bg-brand/10 text-brand border border-brand"
                        : "bg-card text-muted border border-border") +
                    " cursor-pointer"
                  }
                  aria-current={current ? "step" : undefined}
                  aria-label={`Go to ${s.label}${done ? " (complete)" : ""}`}
                >
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </button>
                <span className={
                  "mt-2 text-2xs sm:text-xs font-medium text-center leading-tight break-words " +
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

      <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
        {step === 0 && (
          <MeStep
            data={(form.me ?? {}) as MeData}
            onChange={(p) => patch({ me: { ...(form.me ?? {}), ...p } })}
          />
        )}
        {step === 1 && (
          <ChildStep
            items={children as DraftChild[]}
            onChange={(next) => patch({ children: next })}
          />
        )}
        {step === 2 && (
          <ContactsStep
            data={(form.contacts ?? {}) as DraftContacts}
            onChange={(p) => patch({ contacts: { ...(form.contacts ?? {}), ...p } })}
          />
        )}
        {step === 3 && (
          <BillingStep
            data={(form.billing ?? {}) as DraftBilling}
            onChange={(p) => patch({ billing: { ...(form.billing ?? {}), ...p } })}
            payment={payment}
            onPaymentChange={(p) => setPayment((prev) => ({ ...prev, ...p }))}
          />
        )}
        {step === 4 && (
          <AgreementStep
            data={(form.agreement ?? {}) as DraftAgreement}
            onChange={(p) =>
              patch({ agreement: { ...(form.agreement ?? {}), ...p } })
            }
          />
        )}
      </div>

      {/* A disabled Next explains nothing on a phone — `title` needs a
          hover that touch devices don't have. Say what's missing, on
          every step. */}
      {blocker && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">{blocker}</p>
        </div>
      )}

      {/*
        Sticky on mobile, in-flow on desktop.

        Daniel: having to scroll all the way back down to press Next was
        the friction. A SECOND Next at the top would fix the scroll but
        add a duplicate control right beside the step icons — two things
        that look like "continue", competing. Pinning the real one keeps
        it one tap away with no ambiguity. Desktop has no scroll problem,
        so it stays in the flow there.
      */}
      <div
        className="flex items-center justify-between gap-3 mt-6 sticky bottom-0 sm:static bg-parent-bg sm:bg-transparent border-t border-border sm:border-t-0 -mx-3 sm:mx-0 px-3 sm:px-0 py-3 sm:py-0"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => goTo(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-11 rounded-lg border border-border bg-card text-foreground/80 disabled:opacity-40 shrink-0"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {step < LAST_STEP ? (
          <button
            type="button"
            onClick={() => goTo(step + 1)}
            disabled={!canAdvance}
            className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-5 py-3 min-h-11 rounded-lg bg-brand text-white font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-5 py-3 min-h-11 rounded-lg bg-brand text-white font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <>Submit enrolment <Check className="w-4 h-4" /></>
            )}
          </button>
        )}
      </div>

      <p className="text-center text-xs text-muted mt-4 pb-2">
        Your answers save automatically. You can close this and come back
        any time — we&apos;ll pick up where you left off.
      </p>
    </div>
  );
}
