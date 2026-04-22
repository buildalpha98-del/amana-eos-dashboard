"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateContract } from "@/hooks/useContracts";
import {
  ContractFormFields,
  EMPTY_CONTRACT_FORM,
  buildContractPayload,
  isFormReady,
  type ContractFormValue,
} from "./ContractFormFields";
import type { UserOption } from "./constants";

interface Props {
  users: UserOption[];
  initialUserId?: string;
  onClose: () => void;
}

/**
 * Modal for creating a brand new contract. Owns its own form state and
 * submit handler via `useCreateContract()`.
 */
export function NewContractModal({ users, initialUserId, onClose }: Props) {
  const [form, setForm] = useState<ContractFormValue>({
    ...EMPTY_CONTRACT_FORM,
    userId: initialUserId ?? "",
  });
  const createContract = useCreateContract();

  const handleSubmit = () => {
    const payload = buildContractPayload(form);
    if (!payload) return;
    createContract.mutate(payload, {
      onSuccess: () => onClose(),
    });
  };

  const canSubmit = isFormReady(form) && !createContract.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-foreground">New Contract</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <ContractFormFields
          users={users}
          value={form}
          onChange={setForm}
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
            {createContract.isPending ? "Saving..." : "Create Contract"}
          </button>
        </div>
      </div>
    </div>
  );
}
