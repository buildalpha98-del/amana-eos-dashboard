"use client";

/**
 * Modal for logging a new family-balance contact attempt. Kept simple —
 * one screen, minimum required fields, sensible defaults. When outcome
 * is set to "No answer" the backend auto-creates a follow-up todo for
 * the next day; the form also flips a helper hint to the user so they
 * know that's happening.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  useCreateFamilyBalanceContact,
  type ContactMethod,
  type ContactOutcome,
} from "@/hooks/useFamilyBalanceContacts";
import { useEscapeClose } from "@/hooks/useEscapeClose";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
  state: string | null;
}

const METHOD_OPTIONS: Array<{ value: ContactMethod; label: string }> = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "in_person", label: "In person" },
];

const OUTCOME_OPTIONS: Array<{ value: ContactOutcome; label: string }> = [
  { value: "answered", label: "Answered — spoke with them" },
  { value: "no_answer", label: "No answer / no reply" },
  { value: "promised_payment", label: "Promised payment" },
  { value: "payment_plan", label: "Agreed payment plan" },
  { value: "disputed", label: "Disputed the balance" },
  { value: "other", label: "Other" },
];

export function NewFamilyBalanceContactModal({
  onClose,
}: {
  onClose: () => void;
}) {
  useEscapeClose(onClose);
  const create = useCreateFamilyBalanceContact();

  const today = new Date().toISOString().slice(0, 10);

  const [accountName, setAccountName] = useState("");
  const [parentName, setParentName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [amountOwing, setAmountOwing] = useState("");
  const [contactedAt, setContactedAt] = useState(today);
  const [contactMethod, setContactMethod] = useState<ContactMethod>("phone");
  const [outcome, setOutcome] = useState<ContactOutcome>("answered");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [serviceId, setServiceId] = useState<string>("");

  // Load services once so the picker can render. Not scoped to admin
  // status here — the parent page is already admin-gated by page access,
  // and /api/services respects centre-scoping for non-admin callers.
  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services-list"],
    queryFn: () => fetchApi<ServiceOption[]>("/api/services"),
    staleTime: 5 * 60_000,
  });

  const showFollowUpHint = outcome === "no_answer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountOwing);
    if (!accountName.trim() || !parentName.trim() || !Number.isFinite(amount)) {
      return;
    }
    try {
      await create.mutateAsync({
        accountName: accountName.trim(),
        parentName: parentName.trim(),
        mobileNumber: mobileNumber.trim() || null,
        amountOwing: amount,
        contactedAt: new Date(contactedAt).toISOString(),
        contactMethod,
        outcome,
        outcomeNotes: outcomeNotes.trim() || null,
        serviceId: serviceId || null,
      });
      onClose();
    } catch {
      // toast handled by hook
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-heading font-semibold text-foreground">
              Log family balance contact
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Record every call, email, or SMS chasing an outstanding balance.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Account name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g. Rohman Family"
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Parent name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="e.g. Tamjid Rohman"
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Service / Centre
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">— Not linked to a specific centre —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                  {s.state ? ` · ${s.state}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Tag which centre this family belongs to so State Managers see it in their scope.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Mobile number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="0400 000 000"
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Amount owing (AUD) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={amountOwing}
                onChange={(e) => setAmountOwing(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Date contacted <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={contactedAt}
                onChange={(e) => setContactedAt(e.target.value)}
                max={today}
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                Method <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={contactMethod}
                onChange={(e) =>
                  setContactMethod(e.target.value as ContactMethod)
                }
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Outcome <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {showFollowUpHint && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                A follow-up todo will be created for you, due{" "}
                <strong>tomorrow</strong>, to try again.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Notes {outcome === "answered" && (
                <span className="text-muted font-normal">
                  (what did they say?)
                </span>
              )}
            </label>
            <textarea
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              rows={3}
              placeholder={
                outcome === "answered"
                  ? "e.g. Agreed to pay by Friday, will call back if issues"
                  : outcome === "no_answer"
                    ? "e.g. Left voicemail asking them to call back"
                    : ""
              }
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex-1 px-4 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50"
            >
              {create.isPending ? "Logging..." : "Log contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
