"use client";

import { cn } from "@/lib/utils";
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  AWARD_LEVELS,
  AWARD_LEVEL_LABELS,
  type UserOption,
} from "./constants";

export interface ContractFormValue {
  userId: string;
  contractType: string;
  awardLevel: string;
  awardLevelCustom: string;
  payRate: string;
  hoursPerWeek: string;
  startDate: string;
  endDate: string;
  notes: string;
  // Reserved for Commit 2 (PDF upload). Carried through so we don't lose
  // the existing nullable values when editing a contract.
  documentUrl: string | null;
  documentId: string | null;
}

export const EMPTY_CONTRACT_FORM: ContractFormValue = {
  userId: "",
  contractType: "ct_permanent",
  awardLevel: "",
  awardLevelCustom: "",
  payRate: "",
  hoursPerWeek: "",
  startDate: "",
  endDate: "",
  notes: "",
  documentUrl: null,
  documentId: null,
};

export const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";

interface Props {
  users: UserOption[];
  value: ContractFormValue;
  onChange: (next: ContractFormValue) => void;
  disableUserSelect?: boolean;
}

/**
 * Shared form fields used by NewContractModal and SupersedeContractModal.
 * Does NOT render modal chrome — the parent modal owns header / submit /
 * cancel buttons.
 *
 * PDF upload UI is intentionally omitted — that comes in Commit 2 of the
 * Contracts + Recruitment Rebuild. The `documentUrl` / `documentId` fields
 * are kept in the shape so the value can be preserved when editing.
 */
export function ContractFormFields({
  users,
  value,
  onChange,
  disableUserSelect,
}: Props) {
  const set = <K extends keyof ContractFormValue>(
    key: K,
    next: ContractFormValue[K]
  ) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      {/* Staff Member */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Staff Member *
        </label>
        <select
          value={value.userId}
          onChange={(e) => set("userId", e.target.value)}
          disabled={disableUserSelect}
          className={cn(
            inputCls,
            disableUserSelect && "bg-surface/50 cursor-not-allowed"
          )}
        >
          <option value="">Select staff member...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>

      {/* Contract Type */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Contract Type *
        </label>
        <select
          value={value.contractType}
          onChange={(e) => set("contractType", e.target.value)}
          className={inputCls}
        >
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTRACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Award Level */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Award Level
        </label>
        <select
          value={value.awardLevel}
          onChange={(e) => set("awardLevel", e.target.value)}
          className={inputCls}
        >
          <option value="">No award level</option>
          {AWARD_LEVELS.map((l) => (
            <option key={l} value={l}>
              {AWARD_LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </div>

      {/* Custom Award Level */}
      {value.awardLevel === "custom" && (
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Custom Award Level
          </label>
          <input
            type="text"
            value={value.awardLevelCustom}
            onChange={(e) => set("awardLevelCustom", e.target.value)}
            placeholder="Enter custom award level..."
            className={inputCls}
          />
        </div>
      )}

      {/* Pay Rate + Hours */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Pay Rate (AUD/hr) *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={value.payRate}
            onChange={(e) => set("payRate", e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Hours / Week{" "}
            {value.contractType === "ct_casual" && (
              <span className="text-muted font-normal">(optional)</span>
            )}
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="60"
            value={value.hoursPerWeek}
            onChange={(e) => set("hoursPerWeek", e.target.value)}
            placeholder={value.contractType === "ct_casual" ? "Variable" : "38"}
            className={inputCls}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Start Date *
          </label>
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            End Date{" "}
            <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            type="date"
            value={value.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-1">
          Notes
        </label>
        <textarea
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Additional contract details..."
          className={cn(inputCls, "resize-none")}
        />
      </div>
    </div>
  );
}

/**
 * Build the mutation payload from a ContractFormValue. Returns null if
 * required fields are missing — callers should disable the submit button
 * based on the same check.
 */
export function buildContractPayload(form: ContractFormValue): {
  userId: string;
  contractType: string;
  awardLevel: string | null;
  awardLevelCustom: string | null;
  payRate: number;
  hoursPerWeek: number | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  documentUrl: string | null;
  documentId: string | null;
} | null {
  if (!form.userId || !form.contractType || !form.payRate || !form.startDate) {
    return null;
  }
  return {
    userId: form.userId,
    contractType: form.contractType,
    awardLevel: form.awardLevel || null,
    awardLevelCustom:
      form.awardLevel === "custom" ? form.awardLevelCustom || null : null,
    payRate: parseFloat(form.payRate),
    hoursPerWeek: form.hoursPerWeek ? parseFloat(form.hoursPerWeek) : null,
    startDate: form.startDate,
    endDate: form.endDate || null,
    notes: form.notes || null,
    documentUrl: form.documentUrl,
    documentId: form.documentId,
  };
}

export function isFormReady(form: ContractFormValue): boolean {
  return !!(
    form.userId &&
    form.contractType &&
    form.payRate &&
    form.startDate
  );
}
