"use client";

import { useState, type ChangeEvent } from "react";
import { FileText } from "lucide-react";
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
 * Includes an optional signed-contract PDF upload. Upload goes via
 * `POST /api/upload` (multipart/form-data, 10MB cap, magic-byte validated);
 * the returned `fileUrl` is stored in `EmploymentContract.documentUrl`.
 * `documentId` is left `null` — we don't create a full `Document` record
 * for contract PDFs.
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

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setUploadError("PDF only");
      // Reset the input so the same bad file can be re-selected after fix.
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("PDF too large (max 10MB)");
      e.target.value = "";
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Raw fetch (not fetchApi) — FormData uploads are a documented
      // exception since fetchApi sets JSON content-type.
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error ?? "Upload failed");
      }
      const { fileUrl } = (await res.json()) as { fileUrl: string };
      onChange({ ...value, documentUrl: fileUrl, documentId: null });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

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

      {/* Signed contract PDF upload */}
      <div>
        <label
          htmlFor="contract-pdf-upload"
          className="block text-sm font-medium text-foreground/80 mb-1"
        >
          Signed contract PDF{" "}
          <span className="text-muted text-xs font-normal">(optional)</span>
        </label>
        {value.documentUrl && (
          <div className="mb-2 flex items-center gap-3 text-sm">
            <a
              href={value.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline inline-flex items-center gap-1"
            >
              <FileText className="w-4 h-4" />
              View current PDF
            </a>
            <button
              type="button"
              onClick={() =>
                onChange({ ...value, documentUrl: null, documentId: null })
              }
              className="text-xs text-muted hover:text-foreground"
            >
              Remove
            </button>
          </div>
        )}
        <input
          id="contract-pdf-upload"
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-surface file:text-foreground hover:file:bg-muted/20 disabled:opacity-50"
        />
        {uploading && (
          <p className="text-xs text-muted mt-1">Uploading&hellip;</p>
        )}
        {uploadError && (
          <p className="text-xs text-red-600 mt-1">{uploadError}</p>
        )}
        <p className="text-xs text-muted mt-1">Accepts .pdf up to 10MB</p>
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
