"use client";

import { useState } from "react";
import { ArrowRightLeft, X } from "lucide-react";
import { useSupersedeContract, type ContractData } from "@/hooks/useContracts";
import {
  ContractFormFields,
  buildContractPayload,
  isFormReady,
  type ContractFormValue,
} from "./ContractFormFields";
import type { UserOption } from "./constants";

interface Props {
  users: UserOption[];
  previousContract: ContractData;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Modal for creating a new version of an existing contract. Re-uses
 * ContractFormFields + adds a blue banner announcing the supersession and
 * disables the user-select (a contract cannot move between staff).
 */
export function SupersedeContractModal({
  users,
  previousContract,
  onClose,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<ContractFormValue>({
    userId: previousContract.userId,
    contractType: previousContract.contractType,
    awardLevel: previousContract.awardLevel || "",
    awardLevelCustom: previousContract.awardLevelCustom || "",
    payRate: String(previousContract.payRate),
    hoursPerWeek: previousContract.hoursPerWeek
      ? String(previousContract.hoursPerWeek)
      : "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    notes: "",
    documentUrl: null,
    documentId: null,
  });
  const supersedeContract = useSupersedeContract();

  const handleSubmit = () => {
    const payload = buildContractPayload(form);
    if (!payload) return;
    supersedeContract.mutate(
      {
        contractId: previousContract.id,
        contractType: payload.contractType,
        awardLevel: payload.awardLevel,
        awardLevelCustom: payload.awardLevelCustom,
        payRate: payload.payRate,
        hoursPerWeek: payload.hoursPerWeek,
        startDate: payload.startDate,
        endDate: payload.endDate,
        notes: payload.notes,
        documentUrl: payload.documentUrl,
        documentId: payload.documentId,
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      }
    );
  };

  const canSubmit = isFormReady(form) && !supersedeContract.isPending;
  const shortId = previousContract.id.slice(0, 8);
  const title = `Supersede Contract for ${previousContract.user?.name ?? "Staff"}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Supersede banner */}
        <div className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-brand/5 border border-brand/20">
          <ArrowRightLeft className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80">
            Superseding Contract #<span className="font-mono">{shortId}</span>.
            The previous version will be marked as superseded when this one is
            saved.
          </p>
        </div>

        <ContractFormFields
          users={users}
          value={form}
          onChange={setForm}
          disableUserSelect
        />

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {supersedeContract.isPending ? "Saving..." : "Create New Version"}
          </button>
        </div>
      </div>
    </div>
  );
}
