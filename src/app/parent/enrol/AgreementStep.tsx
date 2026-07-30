"use client";

/**
 * Step 5 — consents, terms, and the parent's signature.
 *
 * Every consent is an explicit Yes/No rather than a tickbox. An unticked
 * box is ambiguous: it could mean "no" or "didn't read it". For ambulance
 * cover and medication administration, staff need to know which.
 */

import { field, Field, SectionHeading, YesNo } from "./ui";
import { ENROLMENTS_EMAIL, type DraftAgreement } from "@/lib/enrol-draft";
import {
  CREDIT_CARD_FEE,
  DIRECT_DEBIT_FEE,
  dishonourDescription,
  feeDescription,
} from "@/lib/enrol-fees";

/**
 * Public policy documents. These pages must EXIST and be current — a
 * checkbox saying "I have read and accept" a document the family was never
 * shown is not an enforceable acceptance, and for the privacy policy it
 * doesn't meet APP 1/5 either.
 */
const TERMS_URL = "https://amanaoshc.com.au/terms";
const PRIVACY_URL = "https://amanaoshc.com.au/privacy";

const CONSENTS: {
  key: keyof DraftAgreement;
  label: string;
  detail: string;
}[] = [
  {
    key: "firstAid",
    label: "First aid",
    detail:
      "I consent to Amana OSHC educators administering first aid to my child if needed.",
  },
  {
    key: "medication",
    label: "Medication",
    detail:
      "I consent to educators administering medication in line with the written authority I provide.",
  },
  {
    key: "ambulance",
    label: "Ambulance",
    detail:
      "I consent to an ambulance being called for my child, and I accept that I am responsible for the cost.",
  },
  {
    key: "transport",
    label: "Transport",
    detail:
      "I consent to my child being transported by Amana OSHC between school and the service.",
  },
  {
    key: "excursions",
    label: "Excursions",
    detail:
      "I consent to my child taking part in excursions and incursions. I'll be told about each one in advance.",
  },
  {
    key: "photos",
    label: "Photos",
    detail:
      "I consent to photos of my child being used in the service's programming and communications.",
  },
  {
    key: "sunscreen",
    label: "Sunscreen",
    detail:
      "I consent to educators applying sunscreen to my child before outdoor play.",
  },
];

const REFERRAL_SOURCES = [
  "School newsletter",
  "Word of mouth",
  "Social media",
  "Google search",
  "Flyer at school",
  "Other",
];

export function AgreementStep({
  data,
  onChange,
}: {
  data: DraftAgreement;
  onChange: (patch: Partial<DraftAgreement>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-5">
        {CONSENTS.map((c) => (
          <div
            key={c.key}
            className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 pb-4 border-b border-border last:border-b-0 sm:border-b-0 sm:pb-0"
          >
            <div className="min-w-0 sm:pr-6">
              <p className="text-sm font-medium text-foreground">
                {c.label} <span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                {c.detail}
              </p>
            </div>
            <div className="shrink-0">
              <YesNo
                label={c.label}
                value={data[c.key] as boolean | null | undefined}
                onChange={(v) => onChange({ [c.key]: v })}
              />
            </div>
          </div>
        ))}
      </div>

      <SectionHeading>Agreement</SectionHeading>

      {/*
        Australian Privacy Principle 5 requires us to tell a family what
        we're collecting and why AT THE POINT of collection. A checkbox
        pointing at a policy they were never shown doesn't satisfy that,
        and the enrolment collects health information, which is "sensitive
        information" needing express consent.
      */}
      <details className="rounded-lg border border-border bg-surface p-3">
        <summary className="text-sm font-medium text-foreground cursor-pointer">
          How we handle your family&apos;s information
        </summary>
        <div className="mt-3 space-y-2 text-xs text-muted leading-relaxed">
          <p>
            Amana OSHC collects the information on this form because the
            Education and Care Services National Law and Regulations require
            us to keep an enrolment record for every child, and because we
            need it to care for your child safely.
          </p>
          <p>
            That includes <strong>health information</strong> — allergies,
            medical conditions, medications and immunisation status. This is
            sensitive information, and we collect it only with your consent
            and only so we can keep your child safe.
          </p>
          <p>
            We share it with: our educators (as needed to care for your
            child), Services Australia (for Child Care Subsidy), and
            emergency services or medical practitioners in an emergency. We
            do not sell it or use it for marketing without asking you
            separately.
          </p>
          <p>
            Enrolment records are kept for the period the Regulations
            require — generally until the child turns 25. You can ask to see
            or correct your family&apos;s information at any time by
            emailing{" "}
            <a href={`mailto:${ENROLMENTS_EMAIL}`} className="underline">
              {ENROLMENTS_EMAIL}
            </a>
            .
          </p>
        </div>
      </details>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(data.termsAccepted)}
            onChange={(e) => onChange({ termsAccepted: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <span className="text-sm text-foreground leading-relaxed">
            I have read and accept Amana OSHC&apos;s{" "}
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              terms and conditions of enrolment
            </a>
            , including the fee schedule.
            <span className="text-red-500"> *</span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(data.privacyAccepted)}
            onChange={(e) => onChange({ privacyAccepted: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <span className="text-sm text-foreground leading-relaxed">
            I have read the notice above and the{" "}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              privacy policy
            </a>
            , and I consent to Amana OSHC collecting and handling my
            family&apos;s information — including my child&apos;s health
            information — as described.
            <span className="text-red-500"> *</span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(data.debitAgreement)}
            onChange={(e) => onChange({ debitAgreement: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <span className="text-sm text-foreground leading-relaxed">
            I authorise Amana OSHC to debit the account I&apos;ve provided
            for fees as they fall due, and I accept the processing fees set
            out on the Billing step — {feeDescription(DIRECT_DEBIT_FEE)} for
            direct debit or {feeDescription(CREDIT_CARD_FEE)} by card, plus{" "}
            {dishonourDescription(DIRECT_DEBIT_FEE)}.
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          id="a-sig"
          label="Type your full name to sign"
          required
          hint="Typing your name here has the same effect as signing by hand."
        >
          <input
            id="a-sig"
            className={field}
            value={data.signature ?? ""}
            onChange={(e) => onChange({ signature: e.target.value })}
            placeholder="Your full name"
            autoComplete="off"
          />
        </Field>
        <Field id="a-ref" label="How did you hear about us?">
          <select
            id="a-ref"
            className={field}
            value={data.referralSource ?? ""}
            onChange={(e) => onChange({ referralSource: e.target.value })}
          >
            <option value="">Select…</option>
            {REFERRAL_SOURCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
