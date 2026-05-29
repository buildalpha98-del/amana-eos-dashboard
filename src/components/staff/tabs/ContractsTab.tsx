"use client";

import { useState } from "react";
import { useContracts, type ContractData } from "@/hooks/useContracts";
import { StatusBadge } from "@/components/contracts/badges";
import {
  CONTRACT_TYPE_LABELS,
  formatCurrency,
  formatDate,
  getAwardLabel,
} from "@/components/contracts/constants";
import { FileSignature, ChevronRight, AlertTriangle } from "lucide-react";
import { FileViewerModal } from "@/components/files/FileViewerModal";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  canEdit: boolean;
}

export function ContractsTab({ userId, canEdit }: Props) {
  const { data: contracts = [], isLoading, error } = useContracts({ userId });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Shared FileViewerModal — clicking "View PDF" or the contract title in the
  // expanded panel sets `viewing` and the modal renders below. We pipe
  // through the auth-checked /api/contracts/[id]/document proxy instead of
  // the raw documentUrl so cross-staff access is blocked server-side.
  const [viewing, setViewing] = useState<ContractData | null>(null);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted">Loading contracts…</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load contracts: {error.message}
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="p-8 text-center">
        <FileSignature className="w-10 h-10 mx-auto text-muted mb-3" />
        <p className="text-sm text-foreground/80">
          No contracts on record for this staff member.
        </p>
        {canEdit && (
          <p className="mt-2 text-xs text-muted">
            Use the Contracts page to create a new contract.
          </p>
        )}
      </div>
    );
  }

  // Newest first
  const sorted = [...contracts].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );

  return (
    <div className="space-y-3">
      {sorted.map((c) => (
        <ContractRow
          key={c.id}
          contract={c}
          expanded={selectedId === c.id}
          onToggle={() =>
            setSelectedId(selectedId === c.id ? null : c.id)
          }
          onView={setViewing}
        />
      ))}

      {viewing && (
        <FileViewerModal
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={`${CONTRACT_TYPE_LABELS[viewing.contractType] ?? viewing.contractType} contract`}
          viewerUrl={`/api/contracts/${viewing.id}/document`}
          downloadUrl={`/api/contracts/${viewing.id}/document?download=1`}
          fileName={`contract-${viewing.id}.pdf`}
        />
      )}
    </div>
  );
}

function ContractRow({
  contract,
  expanded,
  onToggle,
  onView,
}: {
  contract: ContractData;
  expanded: boolean;
  onToggle: () => void;
  onView: (contract: ContractData) => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface transition-colors"
      >
        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted transition-transform",
            expanded && "rotate-90",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm">
              {CONTRACT_TYPE_LABELS[contract.contractType] ?? contract.contractType}
            </span>
            <StatusBadge status={contract.status} />
          </div>
          <div className="text-xs text-muted">
            {formatDate(contract.startDate)}{" "}
            {contract.endDate ? `— ${formatDate(contract.endDate)}` : "— ongoing"}
          </div>
        </div>
        <div className="text-sm font-medium">
          {formatCurrency(contract.payRate)}/hr
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border bg-surface/50 p-4 text-sm grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted mb-0.5">Award</div>
            <div>
              {getAwardLabel(contract.awardLevel, contract.awardLevelCustom)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">Hours / week</div>
            <div>{contract.hoursPerWeek ?? "N/A"}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">Acknowledged</div>
            <div>
              {contract.acknowledgedByStaff
                ? formatDate(contract.acknowledgedAt ?? contract.createdAt)
                : "Pending"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">Signed PDF</div>
            <div>
              {contract.documentUrl ? (
                <button
                  type="button"
                  onClick={() => onView(contract)}
                  className="text-brand hover:underline"
                  data-testid="contract-view-button"
                >
                  View PDF
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                  data-testid="contract-no-file-badge"
                >
                  <AlertTriangle className="w-3 h-3" />
                  No file attached
                </span>
              )}
            </div>
          </div>
          {contract.notes && (
            <div className="col-span-2">
              <div className="text-xs text-muted mb-0.5">Notes</div>
              <div className="whitespace-pre-wrap">{contract.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
