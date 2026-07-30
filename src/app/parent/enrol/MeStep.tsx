"use client";

/**
 * Step 1 — the account holder's own details, plus the CCS questions.
 *
 * CRN is REQUIRED for the primary carer (Daniel, 2026-07-30). Note this
 * does NOT contradict the non-blocking CCS decision in enrol-ccs.ts: a
 * family can still enrol before their subsidy is APPROVED, they just have
 * to give us the CRN that the claim will eventually be made against.
 */

import { AlertTriangle, Info, ExternalLink } from "lucide-react";
import {
  ccsPrompt,
  type CcsApplied,
  type CcsApproved,
} from "@/lib/enrol-ccs";
import { AUSTRALIAN_STATES, CULTURAL_OPTIONS } from "@/components/enrol/types";
import { field } from "./ui";

export interface MeData {
  firstName?: string;
  surname?: string;
  mobile?: string;
  dob?: string;
  gender?: string;
  languageSpoken?: string;
  culturalBackground?: string;
  crn?: string;
  street?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  isLegalCarer?: boolean;
  ccsApproved?: CcsApproved;
  ccsApplied?: CcsApplied;
}

function YesNo({
  name,
  value,
  onChange,
}: {
  name: string;
  value: "yes" | "no" | null | undefined;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="flex gap-2">
      {(["yes", "no"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={
            "px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors " +
            (value === opt
              ? "border-brand bg-brand/10 text-brand"
              : "border-border bg-card text-muted hover:border-brand/40")
          }
        >
          {opt}
        </button>
      ))}
      <span className="sr-only">{name}</span>
    </div>
  );
}

export function MeStep({
  data,
  onChange,
}: {
  data: MeData;
  onChange: (patch: Partial<MeData>) => void;
}) {
  const prompt = ccsPrompt({
    approved: data.ccsApproved ?? null,
    applied: data.ccsApplied ?? null,
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="me-first" className="block text-sm font-medium text-foreground mb-1">
            First name <span className="text-red-500">*</span>
          </label>
          <input id="me-first" className={field} value={data.firstName ?? ""}
            onChange={(e) => onChange({ firstName: e.target.value })} autoComplete="given-name" />
        </div>
        <div>
          <label htmlFor="me-last" className="block text-sm font-medium text-foreground mb-1">
            Last name <span className="text-red-500">*</span>
          </label>
          <input id="me-last" className={field} value={data.surname ?? ""}
            onChange={(e) => onChange({ surname: e.target.value })} autoComplete="family-name" />
        </div>
        <div>
          <label htmlFor="me-mobile" className="block text-sm font-medium text-foreground mb-1">
            Mobile number <span className="text-red-500">*</span>
          </label>
          <input id="me-mobile" type="tel" className={field} value={data.mobile ?? ""}
            onChange={(e) => onChange({ mobile: e.target.value })} autoComplete="tel" placeholder="0400 000 000" />
        </div>
        <div>
          <label htmlFor="me-dob" className="block text-sm font-medium text-foreground mb-1">
            Date of birth <span className="text-red-500">*</span>
          </label>
          <input id="me-dob" type="date" className={field} value={data.dob ?? ""}
            onChange={(e) => onChange({ dob: e.target.value })} />
        </div>
        <div>
          <label htmlFor="me-gender" className="block text-sm font-medium text-foreground mb-1">
            Gender
          </label>
          <select id="me-gender" className={field} value={data.gender ?? ""}
            onChange={(e) => onChange({ gender: e.target.value })}>
            <option value="">Select...</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
        <div>
          <label htmlFor="me-lang" className="block text-sm font-medium text-foreground mb-1">
            Language spoken at home
          </label>
          <input id="me-lang" className={field} value={data.languageSpoken ?? ""}
            onChange={(e) => onChange({ languageSpoken: e.target.value })} placeholder="English" />
        </div>
        {/* Reg 160(3)(i): the record must show the cultural background of
            the child AND their parents. */}
        <div>
          <label htmlFor="me-cultural" className="block text-sm font-medium text-foreground mb-1">
            Your cultural background <span className="text-red-500">*</span>
          </label>
          <select id="me-cultural" className={field} value={data.culturalBackground ?? ""}
            onChange={(e) => onChange({ culturalBackground: e.target.value })}>
            <option value="">Select...</option>
            {CULTURAL_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-foreground pt-2">Home address</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="me-street" className="block text-sm font-medium text-foreground mb-1">
            Street address <span className="text-red-500">*</span>
          </label>
          <input id="me-street" className={field} value={data.street ?? ""}
            onChange={(e) => onChange({ street: e.target.value })} autoComplete="street-address" />
        </div>
        <div>
          <label htmlFor="me-suburb" className="block text-sm font-medium text-foreground mb-1">
            Suburb <span className="text-red-500">*</span>
          </label>
          <input id="me-suburb" className={field} value={data.suburb ?? ""}
            onChange={(e) => onChange({ suburb: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="me-state" className="block text-sm font-medium text-foreground mb-1">
              State
            </label>
            <select id="me-state" className={field} value={data.state ?? ""}
              onChange={(e) => onChange({ state: e.target.value })}>
              <option value="">—</option>
              {AUSTRALIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="me-postcode" className="block text-sm font-medium text-foreground mb-1">
              Postcode
            </label>
            <input id="me-postcode" inputMode="numeric" maxLength={4} className={field}
              value={data.postcode ?? ""} onChange={(e) => onChange({ postcode: e.target.value })} />
          </div>
        </div>
      </div>

      {/* ── Child Care Subsidy ─────────────────────────────── */}
      <div className="pt-2 space-y-4 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground pt-3">
          Child Care Subsidy
        </h3>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Is your Child Care Subsidy approved? <span className="text-red-500">*</span>
          </label>
          <YesNo name="CCS approved" value={data.ccsApproved}
            onChange={(v) => onChange({ ccsApproved: v, ...(v === "yes" ? { ccsApplied: null } : {}) })} />
        </div>

        {prompt.askApplied && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Have you applied for it? <span className="text-red-500">*</span>
            </label>
            <YesNo name="CCS applied" value={data.ccsApplied}
              onChange={(v) => onChange({ ccsApplied: v })} />
          </div>
        )}

        {prompt.tone !== "none" && (
          <div
            className={
              "rounded-lg border p-4 " +
              (prompt.tone === "action"
                ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40"
                : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40")
            }
          >
            <div className="flex items-start gap-2">
              {prompt.tone === "action" ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                {prompt.title && (
                  <p className={
                    "text-sm font-semibold mb-1 " +
                    (prompt.tone === "action"
                      ? "text-amber-900 dark:text-amber-100"
                      : "text-blue-900 dark:text-blue-100")
                  }>
                    {prompt.title}
                  </p>
                )}
                <p className={
                  "text-xs leading-relaxed " +
                  (prompt.tone === "action"
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-blue-800 dark:text-blue-200")
                }>
                  {prompt.body}
                </p>
                {prompt.actionHref && (
                  <a href={prompt.actionHref} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-900 dark:text-amber-100 underline">
                    {prompt.actionLabel}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="me-crn" className="block text-sm font-medium text-foreground mb-1">
            Your CRN <span className="text-red-500">*</span>
          </label>
          <input id="me-crn" className={field} value={data.crn ?? ""}
            onChange={(e) => onChange({ crn: e.target.value })} placeholder="e.g. 123 456 789A" />
          <p className="mt-1 text-xs text-muted">
            Your Centrelink Customer Reference Number, from your myGov or
            Centrelink account. We need this to claim your Child Care
            Subsidy — without it your fees can&apos;t be subsidised.
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <label className="flex items-start gap-3 cursor-pointer pt-3">
          <input type="checkbox" checked={data.isLegalCarer ?? false}
            onChange={(e) => onChange({ isLegalCarer: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand" />
          <span className="text-sm text-foreground">
            I confirm I am the parent or legal carer of the child I&apos;m
            enrolling, and I&apos;m authorised to provide these details.
            <span className="text-red-500"> *</span>
          </span>
        </label>
      </div>
    </div>
  );
}
