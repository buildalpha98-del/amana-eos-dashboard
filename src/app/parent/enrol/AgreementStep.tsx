"use client";

/**
 * Step 5 — consents, terms, and the parent's signature.
 *
 * Every consent is an explicit Yes/No rather than a tickbox. An unticked
 * box is ambiguous: it could mean "no" or "didn't read it". For ambulance
 * cover and medication administration, staff need to know which.
 */

import { field, Field, SectionHeading, YesNo } from "./ui";
import type { DraftAgreement } from "@/lib/enrol-draft";

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
            className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
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

      <div className="space-y-3">
        {(
          [
            {
              key: "termsAccepted" as const,
              text: "I have read and accept Amana OSHC's terms and conditions of enrolment.",
            },
            {
              key: "privacyAccepted" as const,
              text: "I have read and accept the privacy policy, and I consent to my family's information being handled as described in it.",
            },
            {
              key: "debitAgreement" as const,
              text: "I authorise Amana OSHC to debit the account I've provided for fees as they fall due.",
            },
          ]
        ).map((t) => (
          <label key={t.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(data[t.key])}
              onChange={(e) => onChange({ [t.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground leading-relaxed">
              {t.text}
              {t.key !== "debitAgreement" && (
                <span className="text-red-500"> *</span>
              )}
            </span>
          </label>
        ))}
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
