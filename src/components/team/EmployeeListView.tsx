"use client";

/**
 * EmployeeListView — top-level shell for the new Teams tab. Owns the
 * URL ↔ filter-state translation and composes search, filters, table,
 * pagination. Conditionally rendered behind `useTeamsRedesignFlag()`.
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Download, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { BulkInviteModal } from "@/components/settings/BulkInviteModal";
import { exportToCsv } from "@/lib/csv-export";
import { isAdminRole } from "@/lib/role-permissions";
import { useEmployeesList, type EmployeesListParams } from "@/hooks/useEmployeesList";
import { EmployeeRow } from "./EmployeeRow";
import { EmployeeFilters, type EmployeeFiltersValue } from "./EmployeeFilters";
import { EmployeeListPagination } from "./EmployeeListPagination";
import type { Role } from "@prisma/client";

export interface EmployeeListViewProps {
  viewerRole: string;
  services: Array<{ id: string; name: string }>;
}

const STATUS_VALUES = new Set(["active", "pending", "deactivated"]);

export function parseFiltersFromUrl(
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
): EmployeeFiltersValue & { sort: EmployeesListParams["sort"]; page: number } {
  const get = (k: string) => searchParams.get(k);
  const status = get("status");
  const sortRaw = get("sort") ?? "name";
  const validSorts = new Set(["name", "role", "service", "status"]);
  return {
    q: get("q") ?? "",
    status:
      status && STATUS_VALUES.has(status)
        ? (status as EmployeeFiltersValue["status"])
        : null,
    serviceIds: get("s")?.split(",").filter(Boolean) ?? [],
    roles: get("r")?.split(",").filter(Boolean) ?? [],
    sort: (validSorts.has(sortRaw)
      ? sortRaw
      : "name") as EmployeesListParams["sort"],
    page: Math.max(1, Number(get("page") ?? 1) || 1),
  };
}

// Minimal type for the readonly Next.js searchParams object.
type ReadonlyURLSearchParams = {
  get(key: string): string | null;
  toString(): string;
};

export function EmployeeListView({ viewerRole, services }: EmployeeListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filter state from URL.
  const filters = useMemo(
    () => parseFiltersFromUrl(searchParams ?? new URLSearchParams()),
    [searchParams],
  );

  const { data, isLoading, error, refetch } = useEmployeesList({
    q: filters.q || undefined,
    status: filters.status ?? undefined,
    serviceIds: filters.serviceIds.length ? filters.serviceIds : undefined,
    roles: filters.roles.length ? filters.roles : undefined,
    sort: filters.sort,
    page: filters.page,
    pageSize: 50,
  });

  function pushUrl(next: Partial<typeof filters>) {
    const merged = { ...filters, ...next };
    const sp = new URLSearchParams();
    if (merged.q) sp.set("q", merged.q);
    if (merged.status) sp.set("status", merged.status);
    if (merged.serviceIds.length) sp.set("s", merged.serviceIds.join(","));
    if (merged.roles.length) sp.set("r", merged.roles.join(","));
    if (merged.sort && merged.sort !== "name") sp.set("sort", merged.sort);
    if (merged.page && merged.page !== 1) sp.set("page", String(merged.page));
    const qs = sp.toString();
    router.replace(qs ? `/team?${qs}` : "/team", { scroll: false });
  }

  const [showInviteModal, setShowInviteModal] = useState(false);

  const isAdmin = isAdminRole(viewerRole);

  const employees = data?.employees ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasFilters =
    !!filters.q ||
    !!filters.status ||
    filters.serviceIds.length > 0 ||
    filters.roles.length > 0;

  function handleExportCsv() {
    if (!data) return;
    exportToCsv(
      `amana-team-${new Date().toISOString().slice(0, 10)}`,
      data.employees,
      [
        { header: "Name", accessor: (e) => e.name },
        { header: "Email", accessor: (e) => e.email ?? "" },
        { header: "Phone", accessor: (e) => e.phone ?? "" },
        { header: "Role", accessor: (e) => e.role },
        { header: "Service", accessor: (e) => e.service?.name ?? "" },
        { header: "Status", accessor: (e) => e.status },
      ],
    );
  }

  // Search string passed to row links so the profile's Prev/Next nav
  // can re-derive the filter state.
  const listSearchString = useMemo(() => {
    const qs = searchParams?.toString() ?? "";
    return qs ? `?${qs}` : "";
  }, [searchParams]);

  return (
    <div className="max-w-7xl mx-auto space-y-4" data-testid="employee-list-view">
      <PageHeader
        title="Team"
        description="Browse, search, and open employee profiles."
        primaryAction={
          isAdmin
            ? {
                label: "Invite Employees",
                icon: Plus,
                onClick: () => setShowInviteModal(true),
              }
            : undefined
        }
        secondaryActions={[
          {
            label: "Export CSV",
            icon: Download,
            onClick: handleExportCsv,
            hidden: !isAdmin || !data || data.employees.length === 0,
          },
        ]}
      />

      <EmployeeFilters
        value={{
          q: filters.q,
          status: filters.status,
          serviceIds: filters.serviceIds,
          roles: filters.roles,
        }}
        onChange={(next) => pushUrl({ ...next, page: 1 })}
        services={services}
        viewerRole={viewerRole}
      />

      {error ? (
        <ErrorState
          title="Failed to load employees"
          error={error as Error}
          onRetry={refetch}
        />
      ) : isLoading ? (
        <SkeletonTable rows={8} />
      ) : employees.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={Users}
            title="No matches"
            description="No employees match the current filters."
            variant="inline"
            action={{
              label: "Clear all filters",
              onClick: () =>
                pushUrl({
                  q: "",
                  status: null,
                  serviceIds: [],
                  roles: [],
                  page: 1,
                }),
            }}
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No employees yet"
            description={
              isAdmin
                ? "Invite your first one to get started."
                : "Contact an admin to add employees."
            }
            variant="inline"
            action={
              isAdmin
                ? {
                    label: "Add Employee",
                    icon: Plus,
                    onClick: () => {
                      setShowInviteModal(true);
                    },
                  }
                : undefined
            }
          />
        )
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-muted">Role</th>
                  <th className="px-4 py-3 font-medium text-muted">Service</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-muted text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <EmployeeRow
                    key={e.id}
                    employee={e}
                    viewerRole={viewerRole}
                    listSearchString={listSearchString}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 border-t border-border">
            <EmployeeListPagination
              page={filters.page}
              totalPages={totalPages}
              pageSize={50}
              total={total}
              onChange={(p) => pushUrl({ page: p })}
            />
          </div>
        </div>
      )}

      {showInviteModal ? (
        <BulkInviteModal
          open={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          currentUserRole={viewerRole as Role}
        />
      ) : null}
    </div>
  );
}

// ── SkeletonTable ────────────────────────────────────────────────────

function SkeletonTable({ rows }: { rows: number }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-12" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-20" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-14" /></th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-32" />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-16" /></td>
                <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-14 rounded-full" /></td>
                <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-4 ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
