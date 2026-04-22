"use client";

import { useMemo } from "react";
import {
  ArrowRightLeft,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContractData } from "@/hooks/useContracts";
import {
  CONTRACT_TYPE_LABELS,
  formatCurrency,
  formatDate,
  getAwardLabel,
} from "./constants";
import { AcknowledgeBadge, StatusBadge } from "./badges";

interface Props {
  contract: ContractData;
  allContracts: ContractData[];
  onSupersede: (contract: ContractData) => void;
  onTerminate: (contract: ContractData) => void;
  canEdit: boolean;
}

/**
 * Expanded contract detail block, rendered inline beneath its row in
 * ContractsTable. Shows the contract fields grid, notes, version history
 * timeline, and action buttons.
 *
 * Modal state (supersede / terminate) is lifted to the parent via the
 * `onSupersede` / `onTerminate` callbacks so modals can be portaled
 * outside the row and survive re-renders of the list.
 */
export function ContractDetailPanel({
  contract,
  allContracts,
  onSupersede,
  onTerminate,
  canEdit,
}: Props) {
  // Build version history chain (walk forward from current, then backward)
  const versionHistory = useMemo(() => {
    // Walk forward: contracts that superseded this one.
    const forward: ContractData[] = [];
    let child: ContractData | undefined = allContracts.find(
      (c) => c.previousContractId === contract.id
    );
    while (child) {
      forward.unshift(child);
      child = allContracts.find((c) => c.previousContractId === child!.id);
    }

    // Walk backward: previous contract chain.
    const backward: ContractData[] = [contract];
    let prev: ContractData | undefined = contract.previousContractId
      ? allContracts.find((c) => c.id === contract.previousContractId)
      : undefined;
    while (prev) {
      backward.push(prev);
      prev = prev.previousContractId
        ? allContracts.find((c) => c.id === prev!.previousContractId)
        : undefined;
    }
    backward.reverse();

    return [...backward, ...forward.filter((f) => f.id !== contract.id)];
  }, [contract, allContracts]);

  const canSupersede =
    canEdit &&
    (contract.status === "active" || contract.status === "contract_draft");
  const canTerminate =
    canEdit &&
    (contract.status === "active" || contract.status === "contract_draft");

  return (
    <div className="bg-surface/50 border-t border-border/50 px-5 py-4 space-y-4">
      {/* Contract Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Contract Type
          </p>
          <p className="text-sm font-medium text-foreground">
            {CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Award Level
          </p>
          <p className="text-sm font-medium text-foreground">
            {getAwardLabel(contract.awardLevel, contract.awardLevelCustom)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Pay Rate
          </p>
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(contract.payRate)}/hr
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Hours / Week
          </p>
          <p className="text-sm font-medium text-foreground">
            {contract.hoursPerWeek ? `${contract.hoursPerWeek}h` : "Variable"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Start Date
          </p>
          <p className="text-sm font-medium text-foreground">
            {formatDate(contract.startDate)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            End Date
          </p>
          <p className="text-sm font-medium text-foreground">
            {contract.endDate ? formatDate(contract.endDate) : "Ongoing"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Acknowledgement
          </p>
          <AcknowledgeBadge acknowledged={contract.acknowledgedByStaff} />
        </div>
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-0.5">
            Created
          </p>
          <p className="text-sm font-medium text-foreground">
            {formatDate(contract.createdAt)}
          </p>
        </div>
      </div>

      {/* Notes */}
      {contract.notes && (
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
            Notes
          </p>
          <p className="text-sm text-muted bg-card rounded-lg border border-border p-3">
            {contract.notes}
          </p>
        </div>
      )}

      {/* Version History */}
      {versionHistory.length > 1 && (
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Version History
          </p>
          <div className="relative pl-4">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
            {versionHistory.map((v) => (
              <div
                key={v.id}
                className="relative flex items-start gap-3 pb-3 last:pb-0"
              >
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 z-10",
                    v.id === contract.id
                      ? "bg-brand border-brand"
                      : v.status === "active"
                      ? "bg-emerald-500 border-emerald-500"
                      : v.status === "superseded"
                      ? "bg-amber-400 border-amber-400"
                      : v.status === "terminated"
                      ? "bg-red-400 border-red-400"
                      : "bg-gray-300 border-border"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        v.id === contract.id
                          ? "text-brand"
                          : "text-foreground/80"
                      )}
                    >
                      {CONTRACT_TYPE_LABELS[v.contractType]} &mdash;{" "}
                      {formatCurrency(v.payRate)}/hr
                    </span>
                    <StatusBadge status={v.status} />
                    {v.id === contract.id && (
                      <span className="text-xs text-brand font-medium">
                        (current)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {formatDate(v.startDate)}
                    {v.endDate ? ` - ${formatDate(v.endDate)}` : " - Ongoing"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {(canSupersede || canTerminate) && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
          {canSupersede && (
            <button
              onClick={() => onSupersede(contract)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand border border-brand/20 rounded-lg hover:bg-brand/5 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Supersede
            </button>
          )}
          {canTerminate && (
            <button
              onClick={() => onTerminate(contract)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Ban className="w-4 h-4" />
              Terminate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
