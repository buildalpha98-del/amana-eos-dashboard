"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { TemplatesTable } from "@/components/contracts/templates/TemplatesTable";
import { NewTemplateModal } from "@/components/contracts/templates/NewTemplateModal";

type ContractsTab = "issued" | "archived" | "templates";

export default function ContractsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = (session?.user?.role as Role) || undefined;
  const isAdmin = hasMinRole(role, "admin");

  // Tab state (URL-synced). 2026-06-02: added "archived" — terminated
  // contracts now move out of the default Issued view automatically.
  const urlTabRaw = searchParams.get("tab");
  const urlTab: ContractsTab =
    urlTabRaw === "templates"
      ? "templates"
      : urlTabRaw === "archived"
        ? "archived"
        : "issued";
  const [activeTab, setActiveTab] = useState<ContractsTab>(urlTab);

  function handleTabChange(tab: ContractsTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "issued") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.push(qs ? `/contracts?${qs}` : "/contracts");
  }

  // Issued tab — filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");

  // Issued tab — modal state
  const [showCreate, setShowCreate] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState<ContractData | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<ContractData | null>(null);

  // Templates tab — modal state
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  // Contract fetch — driven by the active tab.
  //
  // - "issued":   excludes terminated (the Archived tab handles those).
  //               When the user selects a specific status filter from the
  //               dropdown, that wins — exclude only applies on the
  //               "no specific status" default.
  // - "archived": always status=terminated. The status filter dropdown
  //               is hidden in this view so there's no conflict.
  // - "templates": uses a separate component, this query is idle.
  const contractsFilters = useMemo(() => {
    if (activeTab === "archived") {
      return {
        status: "terminated",
        contractType: contractTypeFilter || undefined,
        search: search || undefined,
      };
    }
    return {
      status: statusFilter || undefined,
      excludeStatus: statusFilter ? undefined : "terminated",
      contractType: contractTypeFilter || undefined,
      search: search || undefined,
    };
  }, [activeTab, statusFilter, contractTypeFilter, search]);

  const {
    data: contracts = [],
    isLoading,
    error,
    refetch,
  } = useContracts(contractsFilters);

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

  // Access guard (unchanged)
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mb-4">
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
      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-0 border-b border-border">
        <button
          type="button"
          onClick={() => handleTabChange("issued")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "issued"
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Issued Contracts
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("archived")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "archived"
              ? "border-brand text-brand"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Archived
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => handleTabChange("templates")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "templates"
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            Templates
          </button>
        )}
      </div>

      {/* ── Issued tab ── */}
      {activeTab === "issued" && (
        <>
          <PageHeader
            title="Contracts"
            description="Manage employment contracts, versions and staff signatures"
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
                  Unsigned
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
        </>
      )}

      {/* ── Archived tab ──
          Same table component as Issued, just driven by a different
          filter set (status=terminated). No summary cards because the
          counts don't carry the same meaning on archived data — and
          no New/Supersede/Terminate actions because every row is
          already in its terminal state. Admin can still open the
          detail panel and re-view the original document. */}
      {activeTab === "archived" && (
        <>
          <PageHeader
            title="Archived Contracts"
            description="Terminated contracts. Read-only — the original document remains accessible."
          />

          <ContractsTable
            contracts={contracts}
            search={search}
            onSearchChange={setSearch}
            statusFilter=""
            onStatusFilterChange={() => {
              /* No-op — status is locked to terminated on this tab. */
            }}
            contractTypeFilter={contractTypeFilter}
            onContractTypeFilterChange={setContractTypeFilter}
            isLoading={isLoading}
            error={error as Error | null}
            onRetry={refetch}
            canEdit={false}
            hideStatusFilter
          />
        </>
      )}

      {/* ── Templates tab ── */}
      {activeTab === "templates" && isAdmin && (
        <>
          <PageHeader
            title="Contract Templates"
            description="Author and manage employment contract templates"
            primaryAction={{
              label: "New Template",
              icon: Plus,
              onClick: () => setShowNewTemplate(true),
            }}
          />

          <TemplatesTable onCreate={() => setShowNewTemplate(true)} />

          {showNewTemplate && (
            <NewTemplateModal onClose={() => setShowNewTemplate(false)} />
          )}
        </>
      )}
    </div>
  );
}
