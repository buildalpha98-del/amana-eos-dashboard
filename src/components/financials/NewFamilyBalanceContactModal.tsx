"use client";

/**
 * Modal for logging (or editing) a family-balance contact attempt.
 *
 * Three modes, all handled by the same form:
 *   1. Create  — `mode="create"`, no `existing`, no `prefill`
 *   2. Edit    — `mode="edit"` + `existing` (the row being edited)
 *   3. Prefill — `mode="create"` + `prefill` (a same-account starter),
 *                used when the user clicks "Log another attempt for this
 *                parent" from the edit view. Copies account/parent/service
 *                fields into a fresh entry so admin doesn't have to retype.
 *
 * The follow-up date field is always available (not just for no_answer)
 * so an admin can capture "call me back on Tuesday" regardless of the
 * outcome. When outcome is no_answer AND the field is left blank, the
 * server defaults it to +1 day.
 */

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  useCreateFamilyBalanceContact,
  useUpdateFamilyBalanceContact,
  type ContactMethod,
  type ContactOutcome,
  type FamilyBalanceContactListItem,
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

export type FamilyBalanceModalPrefill = {
  accountName: string;
  parentName: string;
  mobileNumber?: string | null;
  parentEmail?: string | null;
  amountOwing?: number;
  serviceId?: string | null;
};

interface Props {
  onClose: () => void;
  /** Populated → edit mode. When null and prefill is set → create-with-copy. */
  existing?: FamilyBalanceContactListItem | null;
  /**
   * Seed values for a NEW attempt cloned from an existing account.
   * Used by the "Log another attempt for this parent" button.
   */
  prefill?: FamilyBalanceModalPrefill | null;
  /**
   * Handler called when the admin explicitly wants to open a fresh
   * modal for another attempt on the SAME parent — the parent can
   * close the current instance and re-open with prefill values.
   */
  onLogAnotherAttempt?: (prefill: FamilyBalanceModalPrefill) => void;
}

function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Local-day slice, not toISOString().slice(0,10) — timezone-safe.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewFamilyBalanceContactModal({
  onClose,
  existing,
  prefill,
  onLogAnotherAttempt,
}: Props) {
  useEscapeClose(onClose);
  const create = useCreateFamilyBalanceContact();
  const update = useUpdateFamilyBalanceContact();

  const isEdit = !!existing;
  const today = new Date().toISOString().slice(0, 10);

  const [accountName, setAccountName] = useState(
    existing?.accountName ?? prefill?.accountName ?? "",
  );
  const [parentName, setParentName] = useState(
    existing?.parentName ?? prefill?.parentName ?? "",
  );
  const [mobileNumber, setMobileNumber] = useState(
    existing?.mobileNumber ?? prefill?.mobileNumber ?? "",
  );
  const [parentEmail, setParentEmail] = useState(
    existing?.parentEmail ?? prefill?.parentEmail ?? "",
  );
  const [amountOwing, setAmountOwing] = useState(
    existing?.amountOwing != null
      ? String(existing.amountOwing)
      : prefill?.amountOwing != null
        ? String(prefill.amountOwing)
        : "",
  );
  const [contactedAt, setContactedAt] = useState(
    existing ? toDateInput(existing.contactedAt) : today,
  );
  const [contactMethod, setContactMethod] = useState<ContactMethod>(
    existing?.contactMethod ?? "phone",
  );
  const [outcome, setOutcome] = useState<ContactOutcome>(
    existing?.outcome ?? "answered",
  );
  const [outcomeNotes, setOutcomeNotes] = useState(existing?.outcomeNotes ?? "");
  const [followUpDate, setFollowUpDate] = useState<string>(
    toDateInput(existing?.followUpDate),
  );
  const [serviceId, setServiceId] = useState<string>(
    existing?.serviceId ?? prefill?.serviceId ?? "",
  );

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services-list"],
    queryFn: () => fetchApi<ServiceOption[]>("/api/services"),
    staleTime: 5 * 60_000,
  });

  const submitting = create.isPending || update.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountOwing);
    if (!accountName.trim() || !parentName.trim() || !Number.isFinite(amount)) {
      return;
    }
    const payload = {
      accountName: accountName.trim(),
      parentName: parentName.trim(),
      mobileNumber: mobileNumber.trim() || null,
      parentEmail: parentEmail.trim() || null,
      amountOwing: amount,
      contactedAt: new Date(contactedAt).toISOString(),
      contactMethod,
      outcome,
      outcomeNotes: outcomeNotes.trim() || null,
      followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
      serviceId: serviceId || null,
    };
    try {
      if (isEdit && existing) {
        await update.mutateAsync({ id: existing.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch {
      // toast handled by hooks
    }
  };

  const handleLogAnother = () => {
    if (!onLogAnotherAttempt) return;
    onLogAnotherAttempt({
      accountName: accountName.trim(),
      parentName: parentName.trim(),
      mobileNumber: mobileNumber.trim() || null,
      parentEmail: parentEmail.trim() || null,
      amountOwing: Number.isFinite(Number(amountOwing))
        ? Number(amountOwing)
        : undefined,
      serviceId: serviceId || null,
    });
  };

  const showFollowUpHint =
    !followUpDate && outcome === "no_answer";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-heading font-semibold text-foreground truncate">
              {isEdit ? "Edit family balance contact" : "Log family balance contact"}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {isEdit
                ? "Update outcome, notes, or any detail from this attempt."
                : "Record every call, email, or SMS chasing a balance."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 p-1 rounded-md text-muted hover:text-foreground shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
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
                Email address
              </label>
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                placeholder="parent@example.com"
                className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
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
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Follow-up date{" "}
              <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            <p className="mt-1 text-xs text-muted">
              Pick a date to remind yourself when to follow up — e.g. if they
              said &ldquo;call me back on Tuesday&rdquo;. Leave blank to skip
              the reminder.
            </p>
            {showFollowUpHint && !isEdit && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                No follow-up date set for &ldquo;No answer&rdquo; — a follow-up
                todo will be auto-scheduled for <strong>tomorrow</strong> so
                nothing slips.
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

        </div>

        {/* Sticky footer */}
        <div className="p-4 sm:p-5 border-t border-border shrink-0 bg-card rounded-b-xl">
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            {isEdit && onLogAnotherAttempt && (
              <button
                type="button"
                onClick={handleLogAnother}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-brand border border-brand/30 rounded-lg hover:bg-brand/5 whitespace-nowrap"
                title="Close this edit and open a fresh attempt for the same parent"
              >
                <Plus className="w-4 h-4" />
                Log another attempt
              </button>
            )}
            <div className="flex gap-3 sm:ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border text-foreground/80 font-medium rounded-lg hover:bg-surface whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-brand text-white font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50 whitespace-nowrap"
              >
                {submitting
                  ? isEdit
                    ? "Saving..."
                    : "Logging..."
                  : isEdit
                    ? "Save changes"
                    : "Log contact"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
