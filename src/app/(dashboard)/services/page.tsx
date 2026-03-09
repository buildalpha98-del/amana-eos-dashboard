"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useServices, useDeleteService } from "@/hooks/useServices";
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
} from "lucide-react";
import type { ServiceSummary } from "@/hooks/useServices";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

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

export default function ServicesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceSummary | null>(null);
  const deleteService = useDeleteService();

  // Member/staff: redirect to their assigned service
  const role = session?.user?.role as Role | undefined;
  const serviceId = session?.user?.serviceId as string | undefined;
  const isAdmin = hasMinRole(role, "admin");
  useEffect(() => {
    if ((role === "staff" || role === "member") && serviceId) {
      router.replace(`/services/${serviceId}`);
    }
  }, [role, serviceId, router]);

  // Fetch all services (no status filter — we group client-side)
  const { data: services, isLoading, error, refetch } = useServices();

  // Apply search filter
  const filtered = useMemo(() => {
    if (!services) return [];
    if (!search) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.suburb?.toLowerCase().includes(q) ||
        s.manager?.name.toLowerCase().includes(q)
    );
  }, [services, search]);

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Service Centres
          </h2>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            Manage your OSHC centres across all locations
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Centre
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {swimLanes.map((lane) => (
          <StatCard key={lane.key} title={lane.label} value={grouped.get(lane.key)?.length || 0} />
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search centres..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          />
        </div>
        <p className="text-sm text-gray-400">
          {filtered.length} of {totalCount} centres
        </p>
      </div>

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
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
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
          description={search ? "Try adjusting your search" : "Add your first OSHC centre to get started"}
          variant="inline"
          {...(!search && {
            action: { label: "Add Centre", onClick: () => setShowCreate(true) },
          })}
        />
      ) : (
        <div className="space-y-8">
          {swimLanes.map((lane) => {
            const items = grouped.get(lane.key) || [];
            // Always render the lane header even if empty (shows 0 count)
            return (
              <section key={lane.key}>
                {/* Lane header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-1 h-6 rounded-full border-l-4 ${lane.accentColor}`}
                  />
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    {lane.label}
                  </h3>
                  <span
                    className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-semibold ${lane.badgeColor}`}
                  >
                    {items.length}
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="flex items-center justify-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-sm text-gray-400">
                      No centres in this category
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                    {items.map((service) => (
                      <div
                        key={service.id}
                        className="relative flex-shrink-0 w-[280px] sm:w-[340px] group/card"
                      >
                        <ServiceCard
                          service={service}
                          onClick={() =>
                            router.push(`/services/${service.id}`)
                          }
                        />
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(service);
                            }}
                            className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-white/90 border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 opacity-0 group-hover/card:opacity-100 transition-all z-10"
                            title="Delete centre"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
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
