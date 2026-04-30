"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTeam, type TeamFilters } from "@/hooks/useTeam";
import { fetchApi } from "@/lib/fetch-api";
import { isAdminRole, parseRole } from "@/lib/role-permissions";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaffGrid } from "@/components/directory/StaffGrid";
import {
  DirectoryFilters,
  type DirectoryFiltersValue,
  type ServiceOption,
} from "@/components/directory/DirectoryFilters";
import { ErrorState } from "@/components/ui/ErrorState";

interface ServiceSummary {
  id: string;
  name: string;
  code: string;
  status: string;
}

export function DirectoryContent() {
  const { data: session } = useSession();
  const viewerRole = parseRole(session?.user?.role);

  // Access-aware display rules
  const isAdmin = isAdminRole(viewerRole ?? undefined);
  const showRole = isAdmin || viewerRole === "member";
  const showEmail = isAdmin;
  const showRoleFilter = isAdmin;

  const [filters, setFilters] = useState<DirectoryFiltersValue>({
    q: "",
    service: "",
    role: "",
  });

  // Strip empties before sending to the hook — keeps query key stable.
  const teamFilters: TeamFilters = useMemo(() => {
    const next: TeamFilters = {};
    if (filters.q) next.q = filters.q;
    if (filters.service) next.service = filters.service;
    if (showRoleFilter && filters.role) next.role = filters.role;
    return next;
  }, [filters.q, filters.service, filters.role, showRoleFilter]);

  const { data: members, isLoading, error, refetch } = useTeam(teamFilters);

  // Services for the dropdown — admins can see all, non-admins see active only.
  const { data: services } = useQuery<ServiceSummary[]>({
    queryKey: ["services", "active"],
    queryFn: () => fetchApi<ServiceSummary[]>("/api/services?status=active"),
    staleTime: 5 * 60_000,
    retry: 2,
  });

  const serviceOptions: ServiceOption[] = useMemo(
    () => (services ?? []).map((s) => ({ id: s.id, name: s.name })),
    [services],
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Staff Directory"
        description="Find and connect with your team"
      />

      <DirectoryFilters
        value={filters}
        onChange={setFilters}
        services={serviceOptions}
        showRoleFilter={showRoleFilter}
      />

      {error && (
        <ErrorState
          title="Failed to load directory"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-border border-t-brand rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && !error && (
        <StaffGrid
          staff={(members ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            avatar: m.avatar,
            role: m.role,
            email: showEmail ? m.email : undefined,
            service: m.service ? { name: m.service.name } : null,
          }))}
          showRole={showRole}
          showEmail={showEmail}
        />
      )}
    </div>
  );
}
