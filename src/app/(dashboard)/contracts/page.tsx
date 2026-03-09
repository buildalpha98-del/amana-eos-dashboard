"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  useContracts,
  useContract,
  useCreateContract,
  useUpdateContract,
  useSupersedeContract,
  useTerminateContract,
  type ContractData,
} from "@/hooks/useContracts";
import {
  FileSignature,
  Plus,
  X,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  Ban,
  DollarSign,
  Calendar,
  Briefcase,
  FileText,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import { hasMinRole } from "@/lib/permissions";
import type { Role } from "@prisma/client";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  ct_casual: "Casual",
  ct_part_time: "Part-Time",
  ct_permanent: "Permanent",
  ct_fixed_term: "Fixed Term",
};

const AWARD_LEVEL_LABELS: Record<string, string> = {
  es1: "Education Support L1",
  es2: "Education Support L2",
  es3: "Education Support L3",
  es4: "Education Support L4",
  cs1: "Children's Services L1",
  cs2: "Children's Services L2",
  cs3: "Children's Services L3",
  cs4: "Children's Services L4",
  director: "Director",
  coordinator: "Coordinator",
  custom: "Custom",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  contract_draft: {
    label: "Draft",
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-400",
  },
  active: {
    label: "Active",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  superseded: {
    label: "Superseded",
    bg: "bg-amber-100",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  terminated: {
    label: "Terminated",
    bg: "bg-red-100",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

const CONTRACT_TYPES = ["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"];
const AWARD_LEVELS = [
  "es1", "es2", "es3", "es4",
  "cs1", "cs2", "cs3", "cs4",
  "director", "coordinator", "custom",
];

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function daysUntilDate(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getAwardLabel(level: string | null, custom: string | null): string {
  if (!level) return "N/A";
  if (level === "custom") return custom || "Custom";
  return AWARD_LEVEL_LABELS[level] || level;
}

/* ------------------------------------------------------------------ */
/* StatusBadge                                                         */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.contract_draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
        config.bg,
        config.text
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* AcknowledgeBadge                                                    */
/* ------------------------------------------------------------------ */

function AcknowledgeBadge({ acknowledged }: { acknowledged: boolean }) {
  return acknowledged ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" />
      Acknowledged
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" />
      Pending
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* ContractFormModal                                                    */
/* ------------------------------------------------------------------ */

interface ContractFormProps {
  title: string;
  users: UserOption[];
  initialData?: Partial<{
    userId: string;
    contractType: string;
    awardLevel: string;
    awardLevelCustom: string;
    payRate: string;
    hoursPerWeek: string;
    startDate: string;
    endDate: string;
    notes: string;
  }>;
  disableUserSelect?: boolean;
  isSubmitting: boolean;
  onSubmit: (data: {
    userId: string;
    contractType: string;
    awardLevel: string | null;
    awardLevelCustom: string | null;
    payRate: number;
    hoursPerWeek: number | null;
    startDate: string;
    endDate: string | null;
    notes: string | null;
  }) => void;
  onClose: () => void;
  submitLabel?: string;
}

function ContractFormModal({
  title,
  users,
  initialData,
  disableUserSelect,
  isSubmitting,
  onSubmit,
  onClose,
  submitLabel = "Create Contract",
}: ContractFormProps) {
  const [form, setForm] = useState({
    userId: initialData?.userId || "",
    contractType: initialData?.contractType || "ct_permanent",
    awardLevel: initialData?.awardLevel || "",
    awardLevelCustom: initialData?.awardLevelCustom || "",
    payRate: initialData?.payRate || "",
    hoursPerWeek: initialData?.hoursPerWeek || "",
    startDate: initialData?.startDate || "",
    endDate: initialData?.endDate || "",
    notes: initialData?.notes || "",
  });

  const handleSubmit = () => {
    if (!form.userId || !form.contractType || !form.payRate || !form.startDate) return;
    onSubmit({
      userId: form.userId,
      contractType: form.contractType,
      awardLevel: form.awardLevel || null,
      awardLevelCustom: form.awardLevel === "custom" ? form.awardLevelCustom || null : null,
      payRate: parseFloat(form.payRate),
      hoursPerWeek: form.hoursPerWeek ? parseFloat(form.hoursPerWeek) : null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      notes: form.notes || null,
    });
  };

  const inputCls =
    "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Staff Member */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Staff Member *
            </label>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              disabled={disableUserSelect}
              className={cn(inputCls, disableUserSelect && "bg-gray-50 cursor-not-allowed")}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract Type *
            </label>
            <select
              value={form.contractType}
              onChange={(e) => setForm({ ...form, contractType: e.target.value })}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Award Level
            </label>
            <select
              value={form.awardLevel}
              onChange={(e) => setForm({ ...form, awardLevel: e.target.value })}
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
          {form.awardLevel === "custom" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Award Level
              </label>
              <input
                type="text"
                value={form.awardLevelCustom}
                onChange={(e) => setForm({ ...form, awardLevelCustom: e.target.value })}
                placeholder="Enter custom award level..."
                className={inputCls}
              />
            </div>
          )}

          {/* Pay Rate + Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pay Rate (AUD/hr) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.payRate}
                onChange={(e) => setForm({ ...form, payRate: e.target.value })}
                placeholder="0.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hours / Week{" "}
                {form.contractType === "ct_casual" && (
                  <span className="text-gray-400 font-normal">(optional)</span>
                )}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="60"
                value={form.hoursPerWeek}
                onChange={(e) => setForm({ ...form, hoursPerWeek: e.target.value })}
                placeholder={form.contractType === "ct_casual" ? "Variable" : "38"}
                className={inputCls}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Additional contract details..."
              className={cn(inputCls, "resize-none")}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !form.userId || !form.contractType || !form.payRate || !form.startDate || isSubmitting
            }
            className="px-4 py-2 text-sm font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TerminateDialog                                                     */
/* ------------------------------------------------------------------ */

function TerminateDialog({
  contract,
  isPending,
  onConfirm,
  onClose,
}: {
  contract: ContractData;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <Ban className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Terminate Contract</h3>
            <p className="text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-2">
          Are you sure you want to terminate the{" "}
          <strong>{CONTRACT_TYPE_LABELS[contract.contractType]}</strong> contract for{" "}
          <strong>{contract.user?.name}</strong>?
        </p>
        <p className="text-xs text-gray-400 mb-6">
          The contract status will be set to &quot;Terminated&quot; and can no longer be modified.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending ? "Terminating..." : "Terminate Contract"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ContractDetail (expandable row)                                     */
/* ------------------------------------------------------------------ */

function ContractDetail({
  contract,
  allContracts,
  users,
  onSupersedeSuccess,
}: {
  contract: ContractData;
  allContracts: ContractData[];
  users: UserOption[];
  onSupersedeSuccess: () => void;
}) {
  const [showSupersede, setShowSupersede] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const supersedeContract = useSupersedeContract();
  const terminateContract = useTerminateContract();

  // Build version history chain (walk backwards through previousContractId)
  const versionHistory = useMemo(() => {
    const history: ContractData[] = [];
    let current: ContractData | undefined = contract;

    // First, find any contracts that superseded this one (walk forward)
    const forward: ContractData[] = [];
    let child = allContracts.find((c) => c.previousContractId === contract.id);
    while (child) {
      forward.unshift(child);
      child = allContracts.find((c) => c.previousContractId === child!.id);
    }

    // Walk backward
    const backward: ContractData[] = [contract];
    let prev = contract.previousContractId
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

  const canSupersede = contract.status === "active" || contract.status === "contract_draft";
  const canTerminate = contract.status === "active" || contract.status === "contract_draft";

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-5 py-4 space-y-4">
      {/* Contract Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Contract Type
          </p>
          <p className="text-sm font-medium text-gray-900">
            {CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Award Level
          </p>
          <p className="text-sm font-medium text-gray-900">
            {getAwardLabel(contract.awardLevel, contract.awardLevelCustom)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Pay Rate
          </p>
          <p className="text-sm font-medium text-gray-900">
            {formatCurrency(contract.payRate)}/hr
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Hours / Week
          </p>
          <p className="text-sm font-medium text-gray-900">
            {contract.hoursPerWeek ? `${contract.hoursPerWeek}h` : "Variable"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Start Date
          </p>
          <p className="text-sm font-medium text-gray-900">
            {formatDate(contract.startDate)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            End Date
          </p>
          <p className="text-sm font-medium text-gray-900">
            {contract.endDate ? formatDate(contract.endDate) : "Ongoing"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Acknowledgement
          </p>
          <AcknowledgeBadge acknowledged={contract.acknowledgedByStaff} />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">
            Created
          </p>
          <p className="text-sm font-medium text-gray-900">
            {formatDate(contract.createdAt)}
          </p>
        </div>
      </div>

      {/* Notes */}
      {contract.notes && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Notes
          </p>
          <p className="text-sm text-gray-600 bg-white rounded-lg border border-gray-200 p-3">
            {contract.notes}
          </p>
        </div>
      )}

      {/* Version History */}
      {versionHistory.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Version History
          </p>
          <div className="relative pl-4">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />
            {versionHistory.map((v, idx) => (
              <div key={v.id} className="relative flex items-start gap-3 pb-3 last:pb-0">
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 z-10",
                    v.id === contract.id
                      ? "bg-[#004E64] border-[#004E64]"
                      : v.status === "active"
                      ? "bg-emerald-500 border-emerald-500"
                      : v.status === "superseded"
                      ? "bg-amber-400 border-amber-400"
                      : v.status === "terminated"
                      ? "bg-red-400 border-red-400"
                      : "bg-gray-300 border-gray-300"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        v.id === contract.id ? "text-[#004E64]" : "text-gray-700"
                      )}
                    >
                      {CONTRACT_TYPE_LABELS[v.contractType]} &mdash;{" "}
                      {formatCurrency(v.payRate)}/hr
                    </span>
                    <StatusBadge status={v.status} />
                    {v.id === contract.id && (
                      <span className="text-xs text-[#004E64] font-medium">(current)</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
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
        <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
          {canSupersede && (
            <button
              onClick={() => setShowSupersede(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#004E64] border border-[#004E64]/20 rounded-lg hover:bg-[#004E64]/5 transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Supersede
            </button>
          )}
          {canTerminate && (
            <button
              onClick={() => setShowTerminate(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Ban className="w-4 h-4" />
              Terminate
            </button>
          )}
        </div>
      )}

      {/* Supersede Modal */}
      {showSupersede && (
        <ContractFormModal
          title={`Supersede Contract for ${contract.user?.name}`}
          users={users}
          initialData={{
            userId: contract.userId,
            contractType: contract.contractType,
            awardLevel: contract.awardLevel || "",
            awardLevelCustom: contract.awardLevelCustom || "",
            payRate: String(contract.payRate),
            hoursPerWeek: contract.hoursPerWeek ? String(contract.hoursPerWeek) : "",
            startDate: new Date().toISOString().split("T")[0],
            endDate: "",
            notes: "",
          }}
          disableUserSelect
          isSubmitting={supersedeContract.isPending}
          submitLabel="Create New Version"
          onSubmit={(data) => {
            supersedeContract.mutate(
              {
                contractId: contract.id,
                contractType: data.contractType,
                awardLevel: data.awardLevel,
                awardLevelCustom: data.awardLevelCustom,
                payRate: data.payRate,
                hoursPerWeek: data.hoursPerWeek,
                startDate: data.startDate,
                endDate: data.endDate,
                notes: data.notes,
              },
              {
                onSuccess: () => {
                  setShowSupersede(false);
                  onSupersedeSuccess();
                },
              }
            );
          }}
          onClose={() => setShowSupersede(false)}
        />
      )}

      {/* Terminate Dialog */}
      {showTerminate && (
        <TerminateDialog
          contract={contract}
          isPending={terminateContract.isPending}
          onConfirm={() => {
            terminateContract.mutate(contract.id, {
              onSuccess: () => setShowTerminate(false),
            });
          }}
          onClose={() => setShowTerminate(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Page Component                                                 */
/* ------------------------------------------------------------------ */

export default function ContractsPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role as Role) || undefined;
  const isAdmin = hasMinRole(role, "admin");

  /* Filters */
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  /* Modals */
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Data */
  const {
    data: contracts = [],
    isLoading,
    error,
    refetch,
  } = useContracts({
    status: statusFilter || undefined,
    contractType: typeFilter || undefined,
    search: search || undefined,
  });

  const createContract = useCreateContract();

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  /* Stats */
  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    let active = 0;
    let pendingAck = 0;
    let expiringSoon = 0;
    const staffIds = new Set<string>();

    contracts.forEach((c) => {
      staffIds.add(c.userId);
      if (c.status === "active") {
        active++;
        if (!c.acknowledgedByStaff) pendingAck++;
        if (c.endDate) {
          const endDate = new Date(c.endDate);
          endDate.setHours(0, 0, 0, 0);
          if (endDate >= now && endDate <= thirtyDays) {
            expiringSoon++;
          }
        }
      }
    });

    return {
      active,
      pendingAck,
      expiringSoon,
      totalStaff: staffIds.size,
    };
  }, [contracts]);

  /* Filtered contracts (client-side search supplement) */
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

  /* Access guard */
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Access Restricted</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Contract management is restricted to owners and administrators.
        </p>
      </div>
    );
  }

  /* Loading */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <ErrorState
          title="Failed to load contracts"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  const inputCls =
    "px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent";

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Contracts</h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            Manage employment contracts, versions and staff acknowledgements
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Contract
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff..."
            className={cn(inputCls, "pl-9 w-full")}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputCls}
        >
          <option value="">All Statuses</option>
          <option value="contract_draft">Draft</option>
          <option value="active">Active</option>
          <option value="superseded">Superseded</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={inputCls}
        >
          <option value="">All Types</option>
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTRACT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {(search || statusFilter || typeFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setTypeFilter("");
            }}
            className="text-xs text-[#004E64] hover:underline font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active Contracts
            </p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
              Pending Ack
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.pendingAck}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase tracking-wider">
              Expiring Soon
            </p>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.expiringSoon}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-[#004E64]" />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Staff
            </p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalStaff}</p>
        </div>
      </div>

      {/* Contract List */}
      {filteredContracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-[#004E64]/10 flex items-center justify-center mb-4">
            <FileSignature className="w-8 h-8 text-[#004E64]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No contracts found</h3>
          <p className="text-sm text-gray-500 max-w-sm mb-4">
            {search || statusFilter || typeFilter
              ? "No contracts match your current filters. Try adjusting your search criteria."
              : "Create your first employment contract to get started."}
          </p>
          {!search && !statusFilter && !typeFilter && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Contract
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table Header */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_120px_140px_100px_90px_100px_110px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Staff</span>
            <span>Type</span>
            <span>Award Level</span>
            <span>Pay Rate</span>
            <span>Hours</span>
            <span>Status</span>
            <span>Acknowledged</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {filteredContracts.map((contract) => {
              const isExpanded = expandedId === contract.id;
              const isExpiring =
                contract.status === "active" &&
                contract.endDate &&
                daysUntilDate(contract.endDate) <= 30 &&
                daysUntilDate(contract.endDate) >= 0;

              return (
                <div key={contract.id}>
                  {/* Row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : contract.id)}
                    className={cn(
                      "w-full text-left px-5 py-3.5 hover:bg-gray-50/80 transition-colors",
                      isExpanded && "bg-gray-50/50",
                      isExpiring && "border-l-2 border-l-amber-400"
                    )}
                  >
                    {/* Mobile Layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {contract.user?.name || "Unknown"}
                          </span>
                        </div>
                        <StatusBadge status={contract.status} />
                      </div>
                      <div className="flex items-center gap-3 pl-6 text-xs text-gray-500">
                        <span>{CONTRACT_TYPE_LABELS[contract.contractType]}</span>
                        <span>{formatCurrency(contract.payRate)}/hr</span>
                        <AcknowledgeBadge acknowledged={contract.acknowledgedByStaff} />
                      </div>
                    </div>

                    {/* Desktop Layout */}
                    <div className="hidden sm:grid sm:grid-cols-[1fr_120px_140px_100px_90px_100px_110px] gap-3 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {contract.user?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {contract.user?.email}
                          </p>
                        </div>
                        {isExpiring && (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-sm text-gray-700">
                        {CONTRACT_TYPE_LABELS[contract.contractType]}
                      </span>
                      <span className="text-sm text-gray-700 truncate">
                        {getAwardLabel(contract.awardLevel, contract.awardLevelCustom)}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(contract.payRate)}
                      </span>
                      <span className="text-sm text-gray-600">
                        {contract.hoursPerWeek ? `${contract.hoursPerWeek}h` : "Var."}
                      </span>
                      <StatusBadge status={contract.status} />
                      <AcknowledgeBadge acknowledged={contract.acknowledgedByStaff} />
                    </div>
                  </button>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <ContractDetail
                      contract={contract}
                      allContracts={contracts}
                      users={users}
                      onSupersedeSuccess={() => setExpandedId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Contract Modal */}
      {showCreate && (
        <ContractFormModal
          title="New Contract"
          users={users}
          isSubmitting={createContract.isPending}
          submitLabel="Create Contract"
          onSubmit={(data) => {
            createContract.mutate(
              {
                userId: data.userId,
                contractType: data.contractType,
                awardLevel: data.awardLevel,
                awardLevelCustom: data.awardLevelCustom,
                payRate: data.payRate,
                hoursPerWeek: data.hoursPerWeek,
                startDate: data.startDate,
                endDate: data.endDate,
                notes: data.notes,
              },
              {
                onSuccess: () => setShowCreate(false),
              }
            );
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
