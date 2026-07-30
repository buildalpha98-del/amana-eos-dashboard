"use client";

/**
 * Step 4 — booking pattern and payment details.
 *
 * SECURITY, and the reason this step is shaped differently to the others:
 * card and bank numbers are held in EPHEMERAL component state and are
 * never written to the autosaved draft. Everything else in this wizard
 * persists to EnrolmentDraft.data as plain JSON, and a full PAN sitting in
 * a JSON column — surviving every backup and every DB export — is not a
 * trade worth making for the convenience of resuming.
 *
 * The cost is real and deliberate: a parent who leaves mid-way re-enters
 * their payment details. That's the same thing their bank does.
 *
 * On submit these are sent once, masked for storage and encrypted for the
 * OWNA port, matching src/app/api/enrol/route.ts.
 */

import { ShieldCheck } from "lucide-react";
import { field, Field } from "./ui";
import {
  anySessionSelected,
  SESSION_ROWS,
  WEEKDAYS,
  type DraftBilling,
} from "@/lib/enrol-draft";

export interface PaymentEntry {
  method: "credit_card" | "bank_account" | "";
  cardName: string;
  cardNumber: string;
  cardExpiryMonth: string;
  cardExpiryYear: string;
  cardCcv: string;
  bankAccountName: string;
  bankBsb: string;
  bankAccountNumber: string;
}

export const EMPTY_PAYMENT: PaymentEntry = {
  method: "",
  cardName: "",
  cardNumber: "",
  cardExpiryMonth: "",
  cardExpiryYear: "",
  cardCcv: "",
  bankAccountName: "",
  bankBsb: "",
  bankAccountNumber: "",
};

/** Enough to submit — full validation happens bank-side on first debit. */
export function paymentEntered(p: PaymentEntry): boolean {
  if (p.method === "credit_card") {
    return (
      p.cardName.trim().length > 0 &&
      p.cardNumber.replace(/\s/g, "").length >= 13 &&
      p.cardExpiryMonth.length > 0 &&
      p.cardExpiryYear.length > 0 &&
      p.cardCcv.length >= 3
    );
  }
  if (p.method === "bank_account") {
    return (
      p.bankAccountName.trim().length > 0 &&
      p.bankBsb.replace(/\D/g, "").length === 6 &&
      p.bankAccountNumber.replace(/\D/g, "").length >= 5
    );
  }
  return false;
}

export function BillingStep({
  data,
  onChange,
  payment,
  onPaymentChange,
}: {
  data: DraftBilling;
  onChange: (patch: Partial<DraftBilling>) => void;
  payment: PaymentEntry;
  onPaymentChange: (patch: Partial<PaymentEntry>) => void;
}) {
  const sessions = data.sessions ?? {};

  const toggleDay = (rowKey: string, day: string) => {
    const current = sessions[rowKey] ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    onChange({ sessions: { ...sessions, [rowKey]: next } });
  };

  const toggleSession = (rowKey: string) => {
    const on = (sessions[rowKey] ?? []).length > 0;
    onChange({ sessions: { ...sessions, [rowKey]: on ? [] : ["yes"] } });
  };

  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          id="b-start"
          label="Preferred start date"
          required
          hint="We'll confirm the actual date once your enrolment is approved."
        >
          <input
            id="b-start"
            type="date"
            className={field}
            value={data.startDate ?? ""}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </Field>
        <Field id="b-type" label="Booking type" required>
          <select
            id="b-type"
            className={field}
            value={data.bookingType ?? ""}
            onChange={(e) =>
              onChange({
                bookingType: e.target.value as DraftBilling["bookingType"],
              })
            }
          >
            <option value="">Select…</option>
            <option value="permanent">Permanent — same days each week</option>
            <option value="casual">Casual — book as needed</option>
          </select>
        </Field>
      </div>

      {/* Program on the left, its days or session time on the right —
          matching the layout Daniel supplied. One click per change. */}
      <div>
        <span className="block text-sm font-medium text-foreground mb-3">
          Which sessions do you need? <span className="text-red-500">*</span>
        </span>

        <div className="space-y-1">
          {SESSION_ROWS.map((row) => {
            const picked = sessions[row.key] ?? [];
            return (
              <div
                key={row.key}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_1fr] gap-2 sm:gap-4 items-start py-2.5 border-b border-border last:border-b-0"
              >
                <div className="sm:text-right sm:pt-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {row.label}
                  </span>
                  {row.help && (
                    <span
                      title={row.help}
                      aria-label={row.help}
                      className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand/15 text-brand text-2xs font-bold align-middle cursor-help"
                    >
                      ?
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {row.perDay ? (
                    WEEKDAYS.map((d) => (
                      <label
                        key={d}
                        className="inline-flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={picked.includes(d)}
                          onChange={() => toggleDay(row.key, d)}
                          className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                        />
                        <span className="text-sm text-foreground">{d}</span>
                      </label>
                    ))
                  ) : (
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={picked.length > 0}
                        onChange={() => toggleSession(row.key)}
                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                      />
                      <span className="text-sm text-foreground">{row.time}</span>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!anySessionSelected(data) && (
          <p className="mt-2 text-xs text-muted">
            Pick at least one — you can change these any time once
            you&apos;re enrolled.
          </p>
        )}
      </div>

      <div className="pt-4 border-t border-border space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-3">
          <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
            Your payment details are encrypted and are <strong>not</strong>{" "}
            saved with the rest of your progress. If you come back to finish
            later, you&apos;ll need to enter them again on this step.
          </p>
        </div>

        <Field id="p-method" label="Payment method" required>
          <select
            id="p-method"
            className={field}
            value={payment.method}
            onChange={(e) => {
              const method = e.target.value as PaymentEntry["method"];
              onPaymentChange({ method });
              onChange({ method });
            }}
          >
            <option value="">Select…</option>
            <option value="bank_account">Bank account (direct debit)</option>
            <option value="credit_card">Credit or debit card</option>
          </select>
        </Field>

        {payment.method === "bank_account" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="p-accname"
              label="Account name"
              required
              className="sm:col-span-2"
            >
              <input
                id="p-accname"
                className={field}
                value={payment.bankAccountName}
                onChange={(e) =>
                  onPaymentChange({ bankAccountName: e.target.value })
                }
                autoComplete="off"
              />
            </Field>
            <Field id="p-bsb" label="BSB" required>
              <input
                id="p-bsb"
                inputMode="numeric"
                maxLength={7}
                placeholder="000-000"
                className={field}
                value={payment.bankBsb}
                onChange={(e) => onPaymentChange({ bankBsb: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field id="p-accnum" label="Account number" required>
              <input
                id="p-accnum"
                inputMode="numeric"
                className={field}
                value={payment.bankAccountNumber}
                onChange={(e) =>
                  onPaymentChange({ bankAccountNumber: e.target.value })
                }
                autoComplete="off"
              />
            </Field>
          </div>
        )}

        {payment.method === "credit_card" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="p-cardname"
              label="Name on card"
              required
              className="sm:col-span-2"
            >
              <input
                id="p-cardname"
                className={field}
                value={payment.cardName}
                onChange={(e) => onPaymentChange({ cardName: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field
              id="p-cardnum"
              label="Card number"
              required
              className="sm:col-span-2"
            >
              <input
                id="p-cardnum"
                inputMode="numeric"
                className={field}
                value={payment.cardNumber}
                onChange={(e) => onPaymentChange({ cardNumber: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <Field id="p-mm" label="Month" required>
                <select
                  id="p-mm"
                  className={field}
                  value={payment.cardExpiryMonth}
                  onChange={(e) =>
                    onPaymentChange({ cardExpiryMonth: e.target.value })
                  }
                >
                  <option value="">MM</option>
                  {Array.from({ length: 12 }, (_, i) =>
                    String(i + 1).padStart(2, "0"),
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="p-yy" label="Year" required>
                <select
                  id="p-yy"
                  className={field}
                  value={payment.cardExpiryYear}
                  onChange={(e) =>
                    onPaymentChange({ cardExpiryYear: e.target.value })
                  }
                >
                  <option value="">YYYY</option>
                  {Array.from({ length: 12 }, (_, i) => String(thisYear + i)).map(
                    (y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field id="p-ccv" label="CCV" required>
                <input
                  id="p-ccv"
                  inputMode="numeric"
                  maxLength={4}
                  className={field}
                  value={payment.cardCcv}
                  onChange={(e) => onPaymentChange({ cardCcv: e.target.value })}
                  autoComplete="off"
                />
              </Field>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
