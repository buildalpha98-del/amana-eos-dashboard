"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileSignature,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ContractData } from "@/hooks/useContracts";
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  daysUntilDate,
  formatCurrency,
  getAwardLabel,
} from "./constants";
import { AcknowledgeBadge, StatusBadge } from "./badges";
import { ContractDetailPanel } from "./ContractDetailPanel";

interface Props {
  contracts: ContractData[];
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  contractTypeFilter: string;
  onContractTypeFilterChange: (v: string) => void;
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  onCreate: () => void;
  onSupersede: (contract: ContractData) => void;
  onTerminate: (contract: ContractData) => void;
  canEdit: boolean;
}

const inputCls =
  "px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";

/**
 * Contracts list with filter bar. Manages the "which row is expanded"
 * state locally; all mutation modals are lifted to the parent page via
 * the onSupersede / onTerminate / onCreate callbacks.
 */
export function ContractsTable({
  contracts,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  contractTypeFilter,
  onContractTypeFilterChange,
  isLoading,
  error,
  onRetry,
  onCreate,
  onSupersede,
  onTerminate,
  canEdit,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Client-side search supplement (server already filters by `search` param,
  // but we layer a client filter on top to match original behaviour).
  const filteredContracts = useMemo(() => {
    if (!search) return contracts;
    const q = search.toLowerCase();
    return contracts.filter(
      (c) =>
        c.user?.name?.toLowerCase().includes(q) ||
        c.user?.email?.toLowerCase().includes(q) ||
        CONTRACT_TYPE_LABELS[c.contractType]?.toLowerCase().includes(q)
    );
  }, [contracts, search]);

  const hasFilters = !!(search || statusFilter || contractTypeFilter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-border border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Failed to load contracts" error={error} onRetry={onRetry} />;
  }

  return (
    <>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search staff..."
            className={cn(inputCls, "pl-9 w-full")}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className={inputCls}
        >
          <option value="">All Statuses</option>
          <option value="contract_draft">Draft</option>
          <option value="active">Active</option>
          <option value="superseded">Superseded</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={contractTypeFilter}
          onChange={(e) => onContractTypeFilterChange(e.target.value)}
          className={inputCls}
        >
          <option value="">All Types</option>
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTRACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              onSearchChange("");
              onStatusFilterChange("");
              onContractTypeFilterChange("");
            }}
            className="text-xs text-brand hover:underline font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List / Empty State */}
      {filteredContracts.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No Contracts Found"
          description={
            hasFilters
              ? "No contracts match your current filters. Try adjusting your search criteria."
              : "Create employment contracts for your team members."
          }
          action={
            !hasFilters
              ? {
                  label: "Create First Contract",
                  icon: Plus,
                  onClick: onCreate,
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Table Header */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_120px_140px_100px_90px_100px_110px] gap-3 px-5 py-3 bg-surface/50 border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
            <span>Staff</span>
            <span>Type</span>
            <span>Award Level</span>
            <span>Pay Rate</span>
            <span>Hours</span>
            <span>Status</span>
            <span>Acknowledged</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/50">
            {filteredContracts.map((contract) => {
              const isExpanded = expandedId === contract.id;
              const isExpiring =
                contract.status === "active" &&
                !!contract.endDate &&
                daysUntilDate(contract.endDate) <= 30 &&
                daysUntilDate(contract.endDate) >= 0;

              return (
                <div key={contract.id}>
                  {/* Row */}
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : contract.id)
                    }
                    className={cn(
                      "w-full text-left px-5 py-3.5 hover:bg-surface/80 transition-colors",
                      isExpanded && "bg-surface/30",
                      isExpiring && "border-l-2 border-l-amber-400"
                    )}
                  >
                    {/* Mobile Layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted" />
                          )}
                          <span className="text-sm font-medium text-foreground">
                            {contract.user?.name || "Unknown"}
                          </span>
                        </div>
                        <StatusBadge status={contract.status} />
                      </div>
                      <div className="flex items-center gap-3 pl-6 text-xs text-muted">
                        <span>
                          {CONTRACT_TYPE_LABELS[contract.contractType]}
                        </span>
                        <span>{formatCurrency(contract.payRate)}/hr</span>
                        <AcknowledgeBadge
                          acknowledged={contract.acknowledgedByStaff}
                        />
                      </div>
                    </div>

                    {/* Desktop Layout */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_120px_140px_100px_90px_100px_110px] gap-3 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {contract.user?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-muted truncate">
                            {contract.user?.email}
                          </p>
                        </div>
                        {isExpiring && (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-sm text-foreground/80">
                        {CONTRACT_TYPE_LABELS[contract.contractType]}
                      </span>
                      <span className="text-sm text-foreground/80 truncate">
                        {getAwardLabel(
                          contract.awardLevel,
                          contract.awardLevelCustom
                        )}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(contract.payRate)}
                      </span>
                      <span className="text-sm text-muted">
                        {contract.hoursPerWeek
                          ? `${contract.hoursPerWeek}h`
                          : "Var."}
                      </span>
                      <StatusBadge status={contract.status} />
                      <AcknowledgeBadge
                        acknowledged={contract.acknowledgedByStaff}
                      />
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <ContractDetailPanel
                      contract={contract}
                      allContracts={contracts}
                      onSupersede={onSupersede}
                      onTerminate={onTerminate}
                      canEdit={canEdit}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
