"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateContract } from "@/hooks/useContracts";
import { useContractTemplates } from "@/hooks/useContractTemplates";
import {
  ContractFormFields,
  EMPTY_CONTRACT_FORM,
  buildContractPayload,
  isFormReady,
  type ContractFormValue,
} from "./ContractFormFields";
import { IssueFromTemplateModal } from "./IssueFromTemplateModal";
import type { UserOption } from "./constants";

type Mode = "template" | "blank";

interface Props {
  users: UserOption[];
  initialUserId?: string;
  onClose: () => void;
}

/**
 * Modal for creating a new contract.
 *
 * If active templates exist, defaults to "From template" mode which renders
 * IssueFromTemplateModal. Falls back to "Blank" for manual data entry.
 * The mode can be toggled via the pill buttons at the top.
 */
export function NewContractModal({ users, initialUserId, onClose }: Props) {
  const { data: templates = [] } = useContractTemplates({ status: "active" });
  const hasTemplates = templates.length > 0;

  const [mode, setMode] = useState<Mode>(hasTemplates ? "template" : "blank");

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

  // When "From template" mode is selected, render the full IssueFromTemplateModal
  // as a self-contained replacement (it owns its own layout and footer).
  if (mode === "template") {
    return (
      <IssueFromTemplateModal
        onClose={onClose}
        onSwitchToBlank={() => setMode("blank")}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">New Contract</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Mode toggle — only shown when templates exist */}
        {hasTemplates && (
          <div className="flex items-center gap-1 p-1 bg-surface rounded-lg mb-5">
            <button
              type="button"
              onClick={() => setMode("template")}
              className="flex-1 py-1.5 text-sm font-medium rounded-md transition-colors bg-card text-foreground shadow-sm"
            >
              From template
            </button>
            <button
              type="button"
              onClick={() => setMode("blank")}
              className="flex-1 py-1.5 text-sm font-medium rounded-md transition-colors text-muted hover:text-foreground"
            >
              Blank
            </button>
          </div>
        )}

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
