"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTerminateContract,
  type ContractData,
} from "@/hooks/useContracts";
import { CONTRACT_TYPE_LABELS } from "./constants";

interface Props {
  contract: ContractData;
  onClose: () => void;
}

/**
 * Confirm dialog for terminating a contract. Optional notes + end date
 * are sent through to the terminate endpoint when provided; if left
 * empty the call matches the previous behaviour (`mutate(contract.id)`).
 */
export function TerminateContractDialog({ contract, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [endDate, setEndDate] = useState("");
  const terminate = useTerminateContract();

  const handleConfirm = () => {
    const hasExtras = notes.trim().length > 0 || endDate.length > 0;
    const input = hasExtras
      ? {
          id: contract.id,
          notes: notes.trim() || undefined,
          endDate: endDate || undefined,
        }
      : contract.id;
    terminate.mutate(input, {
      onSuccess: () => onClose(),
    });
  };

  const inputCls =
    "w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Ban className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Terminate Contract
            </h3>
            <p className="text-sm text-muted">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-muted mb-2">
          Are you sure you want to terminate the{" "}
          <strong>{CONTRACT_TYPE_LABELS[contract.contractType]}</strong>{" "}
          contract for <strong>{contract.user?.name}</strong>?
        </p>
        <p className="text-xs text-muted mb-4">
          The contract status will be set to &quot;Terminated&quot; and can no
          longer be modified.
        </p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">
              End Date{" "}
              <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">
              Notes <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason for termination..."
              className={cn(inputCls, "resize-none")}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={terminate.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {terminate.isPending ? "Terminating..." : "Terminate Contract"}
          </button>
        </div>
      </div>
    </div>
  );
}
