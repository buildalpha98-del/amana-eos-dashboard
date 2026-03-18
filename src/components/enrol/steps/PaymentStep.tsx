"use client";

import { CreditCard, Building2 } from "lucide-react";
import { EnrolmentFormData, PaymentInfo } from "../types";

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
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
      />
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i));

export function PaymentStep({ data, updateData }: Props) {
  const payment = data.payment;

  const update = (field: keyof PaymentInfo, value: string) => {
    updateData({ payment: { ...payment, [field]: value } });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Payment Details</h3>
        <p className="text-sm text-gray-500 mb-6">
          Your payment details are collected securely and will only be used for processing your
          child care fees.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Payment Method</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => update("method", "credit_card")}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
              payment.method === "credit_card"
                ? "bg-brand/5 border-brand"
                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
            }`}
          >
            <CreditCard className={`h-5 w-5 ${payment.method === "credit_card" ? "text-brand" : "text-gray-400"}`} />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">Credit / Debit Card</p>
              <p className="text-xs text-gray-500">Visa, Mastercard, Amex</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => update("method", "bank_account")}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
              payment.method === "bank_account"
                ? "bg-brand/5 border-brand"
                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
            }`}
          >
            <Building2 className={`h-5 w-5 ${payment.method === "bank_account" ? "text-brand" : "text-gray-400"}`} />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">Bank Account</p>
              <p className="text-xs text-gray-500">Direct debit</p>
            </div>
          </button>
        </div>
      </div>

      {payment.method === "credit_card" && (
        <div className="space-y-4 bg-gray-50 rounded-xl p-5 border border-gray-100">
          <Input
            label="Name on Card"
            value={payment.cardName}
            onChange={(v) => update("cardName", v)}
            required
          />
          <Input
            label="Card Number"
            value={payment.cardNumber}
            onChange={(v) => update("cardNumber", v.replace(/\D/g, "").slice(0, 16))}
            placeholder="1234 5678 9012 3456"
            required
            maxLength={16}
          />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Month <span className="text-red-500">*</span>
              </label>
              <select
                value={payment.cardExpiryMonth}
                onChange={(e) => update("cardExpiryMonth", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
              >
                <option value="">MM</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year <span className="text-red-500">*</span>
              </label>
              <select
                value={payment.cardExpiryYear}
                onChange={(e) => update("cardExpiryYear", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
              >
                <option value="">YYYY</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <Input
              label="CCV"
              value={payment.cardCcv}
              onChange={(v) => update("cardCcv", v.replace(/\D/g, "").slice(0, 4))}
              placeholder="123"
              required
              maxLength={4}
            />
          </div>
        </div>
      )}

      {payment.method === "bank_account" && (
        <div className="space-y-4 bg-gray-50 rounded-xl p-5 border border-gray-100">
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
      )}

      {payment.method && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-2">Surcharge Disclosure</h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>Visa / Mastercard: 1.75% surcharge</li>
              <li>American Express: 2.65% surcharge</li>
              <li>Bank Account: $0.75 per transaction</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 p-4 rounded-xl border bg-gray-50 border-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={data.debitAgreement}
              onChange={(e) => updateData({ debitAgreement: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                Direct Debit Service Agreement
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                I authorise Amana OSHC to debit my account for child care fees as per the
                fee schedule.
              </p>
            </div>
          </label>
        </>
      )}
    </div>
  );
}
