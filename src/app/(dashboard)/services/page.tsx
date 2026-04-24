"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useServices, useDeleteService } from "@/hooks/useServices";
import { useUpdateService } from "@/hooks/useServices";
import { ServiceCard } from "@/components/services/ServiceCard";
import { CreateServiceModal } from "@/components/services/CreateServiceModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { hasMinRole } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Building2,
  Plus,
  Search,
  Trash2,
  CheckSquare,
  Square,
  X,
  Loader2,
} from "lucide-react";
import type { ServiceSummary } from "@/hooks/useServices";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";

/** Swim-lane definitions — order matters for rendering */
const swimLanes = [
  {
    key: "open",
    label: "Open",
    statuses: ["active"],
    badgeColor: "bg-emerald-100 text-emerald-700",
    accentColor: "border-emerald-400",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    statuses: ["onboarding"],
    badgeColor: "bg-blue-100 text-blue-700",
    accentColor: "border-blue-400",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    statuses: ["pipeline"],
    badgeColor: "bg-purple-100 text-purple-700",
    accentColor: "border-purple-400",
  },
  {
    key: "closed",
    label: "Closed",
    statuses: ["closing", "closed"],
    badgeColor: "bg-gray-100 text-gray-500",
    accentColor: "border-gray-400",
  },
] as const;

type SortKey = "name" | "state" | "updated";

export default function ServicesPage() {
  const v2 = useStaffV2Flag();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceSummary | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const deleteService = useDeleteService();
  const updateService = useUpdateService();

  // ── Bulk selection state ────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");

  const role = session?.user?.role as Role | undefined;
  const serviceId = session?.user?.serviceId as string | undefined;
  const isAdmin = hasMinRole(role, "admin");

  // ── #3 Direct-to-service landing ────────────────────────
  const shouldRedirect =
    (role === "staff" || role === "member") && !!serviceId;

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(`/services/${serviceId}`);
    }
  }, [shouldRedirect, serviceId, router]);

  // Fetch all services — hook must be called unconditionally (Rules of Hooks)
  const { data: services, isLoading, error, refetch } = useServices();

  // Apply search + sort
  const filtered = useMemo(() => {
    if (!services) return [];
    let list = services;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.suburb?.toLowerCase().includes(q) ||
          s.state?.toLowerCase().includes(q) ||
          s.manager?.name.toLowerCase().includes(q)
      );
    }
    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "state")
        return (a.state || "").localeCompare(b.state || "");
      if (sortBy === "updated")
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      return 0;
    });
  }, [services, search, sortBy]);

  // Group filtered services into swim lanes
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceSummary[]>();
    for (const lane of swimLanes) {
      map.set(
        lane.key,
        filtered.filter((s) =>
          (lane.statuses as readonly string[]).includes(s.status)
        )
      );
    }
    return map;
  }, [filtered]);

  const totalCount = services?.length || 0;

  // Show loader while session loads or while redirecting
  if (sessionStatus === "loading" || shouldRedirect) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  // ── Bulk actions ────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkAction("");
  }

  async function executeBulkAction() {
    if (!bulkAction || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      if (bulkAction === "delete") {
        for (const id of ids) {
          await deleteService.mutateAsync(id);
        }
        toast({
          description: `Deleted ${ids.length} centre${ids.length !== 1 ? "s" : ""}.`,
        });
      } else {
        // Status change
        for (const id of ids) {
          await updateService.mutateAsync({ id, status: bulkAction });
        }
        const label =
          bulkAction === "active"
            ? "Active"
            : bulkAction === "onboarding"
            ? "Onboarding"
            : bulkAction === "pipeline"
            ? "Pipeline"
            : bulkAction === "closed"
            ? "Closed"
            : bulkAction;
        toast({
          description: `Updated ${ids.length} centre${ids.length !== 1 ? "s" : ""} to ${label}.`,
        });
      }
      clearSelection();
    } catch (err) {
      toast({ description: "Bulk action failed. Please try again." });
    }
  }

  const isBulkMode = selectedIds.size > 0;

  return (
    <div
      {...(v2 ? { "data-v2": "staff" } : {})}
      className="max-w-7xl mx-auto space-y-6"
    >
      {/* Header */}
      <PageHeader
        title="Service Centres"
        description="Manage your OSHC centres across all locations"
        primaryAction={{ label: "Add Centre", icon: Plus, onClick: () => setShowCreate(true) }}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {swimLanes.map((lane) => (
          <StatCard
            key={lane.key}
            title={lane.label}
            value={grouped.get(lane.key)?.length || 0}
          />
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search centres..."
            aria-label="Search centres"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Sort centres"
            className="text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="name">Sort: Name</option>
            <option value="state">Sort: State</option>
            <option value="updated">Sort: Recently Updated</option>
          </select>
          {isAdmin && (
            <button
              onClick={selectAll}
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground px-2 py-1"
              title={
                selectedIds.size === filtered.length
                  ? "Deselect all"
                  : "Select all"
              }
            >
              {selectedIds.size === filtered.length && filtered.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-brand" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Select
            </button>
          )}
        </div>
        <p className="text-sm text-muted sm:ml-auto">
          {filtered.length} of {totalCount} centres
        </p>
      </div>

      {/* ── Bulk Action Bar ────────────────────────────────── */}
      {isBulkMode && isAdmin && (
        <div className="flex items-center gap-3 px-4 py-3 bg-brand/5 border border-brand/20 rounded-xl">
          <span className="text-sm font-medium text-brand">
            {selectedIds.size} selected
          </span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">Choose action...</option>
            <option value="active">Set Active</option>
            <option value="onboarding">Set Onboarding</option>
            <option value="pipeline">Set Pipeline</option>
            <option value="closed">Set Closed</option>
            <option value="delete">Delete</option>
          </select>
          <button
            onClick={executeBulkAction}
            disabled={!bulkAction || updateService.isPending || deleteService.isPending}
            className="px-3 py-1.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {updateService.isPending || deleteService.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Apply"
            )}
          </button>
          <button
            onClick={clearSelection}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorState
          title="Failed to load services"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {/* Swim Lanes */}
      {error ? null : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border p-4 space-y-3"
            >
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No service centres found"
          description={
            search
              ? "Try adjusting your search"
              : "Add your first OSHC centre to get started"
          }
          variant="inline"
          {...(!search && {
            action: {
              label: "Add Centre",
              onClick: () => setShowCreate(true),
            },
          })}
        />
      ) : (
        <div className="space-y-8">
          {swimLanes.map((lane) => {
            const items = grouped.get(lane.key) || [];
            return (
              <section key={lane.key}>
                {/* Lane header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-1 h-6 rounded-full border-l-4 ${lane.accentColor}`}
                  />
                  <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">
                    {lane.label}
                  </h3>
                  <span
                    className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-semibold ${lane.badgeColor}`}
                  >
                    {items.length}
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="flex items-center justify-center py-6 bg-surface/50 rounded-xl border border-dashed border-border">
                    <p className="text-sm text-muted">
                      No centres in this category
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop: horizontal scroll */}
                    <div className="hidden sm:flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                      {items.map((service) => (
                        <div
                          key={service.id}
                          className="relative flex-shrink-0 w-[340px] group/card"
                        >
                          {/* Bulk select checkbox */}
                          {isAdmin && isBulkMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(service.id);
                              }}
                              className="absolute top-3 left-3 z-10 p-0.5"
                            >
                              {selectedIds.has(service.id) ? (
                                <CheckSquare className="w-5 h-5 text-brand" />
                              ) : (
                                <Square className="w-5 h-5 text-border" />
                              )}
                            </button>
                          )}
                          <ServiceCard
                            service={service}
                            onClick={() =>
                              isBulkMode
                                ? toggleSelect(service.id)
                                : router.push(`/services/${service.id}`)
                            }
                          />
                          {isAdmin && !isBulkMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(service);
                              }}
                              className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-card/90 border border-border text-muted hover:text-red-600 hover:border-red-300 opacity-0 group-hover/card:opacity-100 transition-all z-10"
                              title="Delete centre"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Mobile: vertical stack */}
                    <div className="sm:hidden space-y-3">
                      {items.map((service) => (
                        <div key={service.id} className="relative group/card">
                          {/* Bulk select checkbox */}
                          {isAdmin && isBulkMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(service.id);
                              }}
                              className="absolute top-3 left-3 z-10 p-0.5"
                            >
                              {selectedIds.has(service.id) ? (
                                <CheckSquare className="w-5 h-5 text-brand" />
                              ) : (
                                <Square className="w-5 h-5 text-border" />
                              )}
                            </button>
                          )}
                          <ServiceCard
                            service={service}
                            onClick={() =>
                              isBulkMode
                                ? toggleSelect(service.id)
                                : router.push(`/services/${service.id}`)
                            }
                          />
                          {/* Touch-friendly delete — always visible on mobile */}
                          {isAdmin && !isBulkMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(service);
                              }}
                              className="absolute bottom-2 left-2 p-2 rounded-lg bg-card border border-border text-muted active:text-red-600 active:border-red-300 z-10"
                              title="Delete centre"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <CreateServiceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This will permanently delete this centre and all associated timesheets, financial data, metrics, and compliance records. Todos, issues, and rocks will be unlinked but preserved. This action cannot be undone."
        confirmLabel="Delete Centre"
        variant="danger"
        loading={deleteService.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteService.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
