"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCreateContract } from "@/hooks/useContracts";
import {
  ContractFormFields,
  EMPTY_CONTRACT_FORM,
  buildContractPayload,
  isFormReady,
  type ContractFormValue,
} from "./ContractFormFields";
import { IssueFromTemplateModal } from "./IssueFromTemplateModal";
import type { UserOption } from "./constants";
import { useEscapeClose } from "@/hooks/useEscapeClose";

type Mode = "template" | "blank";

interface Props {
  users: UserOption[];
  initialUserId?: string;
  /** 2026-06-03 — when launching directly into "Upload existing
   *  contract" (e.g. from a staff profile button), the caller can
   *  set initialMode="blank" so the modal skips the template chooser. */
  initialMode?: Mode;
  onClose: () => void;
}

/**
 * Entry point for creating a new contract.
 *
 * Defaults to IssueFromTemplateModal first. The blank form is reachable
 * via the "Upload existing signed contract" link in the template
 * modal's header, or directly via `initialMode="blank"` from callers
 * that already know that's what they want.
 */
export function NewContractModal({
  users,
  initialUserId,
  initialMode = "template",
  onClose,
}: Props) {
  useEscapeClose(onClose);
  const [mode, setMode] = useState<Mode>(initialMode);

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

  if (mode === "template") {
    return (
      <IssueFromTemplateModal
        onClose={onClose}
        onSwitchToBlank={() => setMode("blank")}
      />
    );
  }

  // Portal to <body> so `position: fixed` escapes the dashboard <main>'s
  // animate-slide-up containing block (see IssueFromTemplateModal for details).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Upload existing contract
            </h3>
            <p className="text-xs text-muted mt-0.5">
              For contracts signed off-platform (e.g. Employment Hero). Tick
              &quot;already signed&quot; below to skip the re-signing step.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("template")}
              className="text-xs text-muted hover:text-foreground transition-colors underline underline-offset-2"
            >
              Issue from template instead
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>
        </div>

        <ContractFormFields
          users={users}
          value={form}
          onChange={setForm}
        />

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {createContract.isPending ? "Saving..." : "Create Contract"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
