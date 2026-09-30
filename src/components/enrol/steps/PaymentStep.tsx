"use client";

import { useEffect } from "react";
import { EnrolmentFormData, PaymentInfo } from "../types";
import {
  DIRECT_DEBIT_FEE,
  dishonourDescription,
  feeDescription,
  feeExample,
} from "@/lib/enrol-fees";

interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
}

function Input({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground/80 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
      />
    </div>
  );
}

export function PaymentStep({ data, updateData }: Props) {
  const payment = data.payment;

  const update = (field: keyof PaymentInfo, value: string) => {
    updateData({ payment: { ...payment, [field]: value } });
  };

  // Auto-set payment method to bank_account — credit card removed 2026-09-30
  useEffect(() => {
    if (payment.method !== "bank_account") {
      updateData({ payment: { ...payment, method: "bank_account" } });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Payment Details</h3>
        <p className="text-sm text-muted mb-6">
          Your bank account details are collected securely and will only be used for
          direct debit of your child care fees.
        </p>
      </div>

      <div className="space-y-4 bg-surface/50 rounded-xl p-5 border border-border/50">
        <Input
          label="Account Name"
          value={payment.bankAccountName}
          onChange={(v) => update("bankAccountName", v)}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="BSB"
            value={payment.bankBsb}
            onChange={(v) => update("bankBsb", v.replace(/\D/g, "").slice(0, 6))}
            placeholder="123-456"
            required
            maxLength={6}
          />
          <Input
            label="Account Number"
            value={payment.bankAccountNumber}
            onChange={(v) => update("bankAccountNumber", v.replace(/\D/g, ""))}
            required
          />
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-amber-800 mb-2">Direct debit fees</h4>
        <ul className="text-sm text-amber-700 space-y-1">
          <li>
            Direct debit: {feeDescription(DIRECT_DEBIT_FEE)}
            {feeExample(DIRECT_DEBIT_FEE) ? ` — ${feeExample(DIRECT_DEBIT_FEE)}` : ""}
          </li>
          <li>{dishonourDescription(DIRECT_DEBIT_FEE)}</li>
        </ul>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-xl border bg-surface/50 border-border cursor-pointer">
        <input
          type="checkbox"
          checked={data.debitAgreement}
          onChange={(e) => updateData({ debitAgreement: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            Direct Debit Service Agreement
          </p>
          <p className="text-xs text-muted mt-0.5">
            I authorise Amana OSHC to debit my account for child care fees as per the
            fee schedule.
          </p>
        </div>
      </label>
    </div>
  );
}
