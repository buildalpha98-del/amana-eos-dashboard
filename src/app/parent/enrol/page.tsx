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
  contactsBlocker,
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

      {/* Contacts has the most rules, so a dead Next there is the most
          confusing. Say exactly what's missing rather than leaving them to
          guess — Daniel hit precisely this. */}
      {step === 2 && !canAdvance && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {contactsBlocker(form)}
          </p>
        </div>
      )}

      {/* On the final step, say WHY submit is disabled. A dead button with
          no explanation is the worst possible end to a long form. */}
      {step === LAST_STEP && !canSubmit && !submitting && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {!stepComplete(4, form)
              ? "Please answer every consent, accept the terms and privacy policy, and type your name to sign."
              : !paymentEntered(payment)
                ? "Please go back to Billing and enter your payment details — they aren't saved between visits."
                : "Some earlier steps are incomplete. Use the circles above to go back and finish them."}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={() => goTo(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-foreground/80 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {step < LAST_STEP ? (
          <button
            type="button"
            onClick={() => goTo(step + 1)}
            disabled={!canAdvance}
            title={!canAdvance ? "Please complete the required fields" : undefined}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <>Submit enrolment <Check className="w-4 h-4" /></>
            )}
          </button>
        )}
      </div>

      <p className="text-center text-xs text-muted mt-4">
        Your answers save automatically. You can close this and come back
        any time — we&apos;ll pick up where you left off.
      </p>
    </div>
  );
}
