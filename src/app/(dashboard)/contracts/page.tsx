"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import {
  useContracts,
  type ContractData,
} from "@/hooks/useContracts";
import { PageHeader } from "@/components/layout/PageHeader";
import { hasMinRole } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { ContractsTable } from "@/components/contracts/ContractsTable";
import { NewContractModal } from "@/components/contracts/NewContractModal";
import { SupersedeContractModal } from "@/components/contracts/SupersedeContractModal";
import { TerminateContractDialog } from "@/components/contracts/TerminateContractDialog";
import type { UserOption } from "@/components/contracts/constants";
import { fetchApi } from "@/lib/fetch-api";

export default function ContractsPage() {
  const { data: session } = useSession();
  const role = (session?.user?.role as Role) || undefined;
  const isAdmin = hasMinRole(role, "admin");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");

  // Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState<ContractData | null>(
    null
  );
  const [terminateTarget, setTerminateTarget] = useState<ContractData | null>(
    null
  );

  // Data
  const {
    data: contracts = [],
    isLoading,
    error,
    refetch,
  } = useContracts({
    status: statusFilter || undefined,
    contractType: contractTypeFilter || undefined,
    search: search || undefined,
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<UserOption[]>("/api/users"),
    retry: 2,
    staleTime: 60_000,
  });

  // Summary stats
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

  // Access guard
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Access Restricted
        </h3>
        <p className="text-sm text-muted max-w-sm">
          Contract management is restricted to owners and administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Contracts"
        description="Manage employment contracts, versions and staff acknowledgements"
        primaryAction={{
          label: "New Contract",
          icon: Plus,
          onClick: () => setShowCreate(true),
        }}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-medium text-muted uppercase tracking-wider">
              Active Contracts
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.active}</p>
        </div>
        <div className="bg-card rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
              Pending Ack
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{stats.pendingAck}</p>
        </div>
        <div className="bg-card rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase tracking-wider">
              Expiring Soon
            </p>
          </div>
          <p className="text-2xl font-bold text-red-600">{stats.expiringSoon}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-brand" />
            <p className="text-xs font-medium text-muted uppercase tracking-wider">
              Total Staff
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalStaff}</p>
        </div>
      </div>

      <ContractsTable
        contracts={contracts}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        contractTypeFilter={contractTypeFilter}
        onContractTypeFilterChange={setContractTypeFilter}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={refetch}
        onCreate={() => setShowCreate(true)}
        onSupersede={(c) => setSupersedeTarget(c)}
        onTerminate={(c) => setTerminateTarget(c)}
        canEdit={isAdmin}
      />

      {/* Modals */}
      {showCreate && (
        <NewContractModal users={users} onClose={() => setShowCreate(false)} />
      )}
      {supersedeTarget && (
        <SupersedeContractModal
          users={users}
          previousContract={supersedeTarget}
          onClose={() => setSupersedeTarget(null)}
        />
      )}
      {terminateTarget && (
        <TerminateContractDialog
          contract={terminateTarget}
          onClose={() => setTerminateTarget(null)}
        />
      )}
    </div>
  );
}
