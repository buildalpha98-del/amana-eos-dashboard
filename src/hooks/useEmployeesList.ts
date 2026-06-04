"use client";

/**
 * useEmployeesList — paginated, filterable employees query for the new
 * Teams tab. Wraps `/api/employees` (PR 1) with React Query + `fetchApi`.
 *
 * URL params use short codes (`s=`, `r=`) to keep heavily-filtered URLs
 * readable. The hook accepts a structured params object; callers translate
 * URL ↔ params via the helpers in `EmployeeListView`.
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface EmployeesListParams {
  q?: string;
  status?: "active" | "pending" | "deactivated";
  serviceIds?: string[];
  roles?: string[];
  tags?: string[];
  sort?: "name" | "role" | "service" | "status";
  page?: number;
  pageSize?: number;
}

export interface EmployeeListItem {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  phone: string | null;
  role: string;
  tags: string[];
  service: { id: string; name: string } | null;
  status: "active" | "pending" | "deactivated";
  /** True when this user is linked to their Employment Hero Payroll
   *  employee record. False shows a red "needs payroll link" badge
   *  on the row so admins can spot un-synced staff at a glance. */
  payrollLinked: boolean;
}

export interface EmployeesListResponse {
  employees: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Count of pending users visible to the admin viewer (always 0
   *  for non-admin tiers — drives the bulk-resend button). */
  pendingCount: number;
}

function buildUrl(p: EmployeesListParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.status) sp.set("status", p.status);
  if (p.serviceIds?.length) sp.set("s", p.serviceIds.join(","));
  if (p.roles?.length) sp.set("r", p.roles.join(","));
  if (p.tags?.length) sp.set("tag", p.tags.join(","));
  sp.set("page", String(p.page ?? 1));
  sp.set("pageSize", String(p.pageSize ?? 50));
  sp.set("sort", p.sort ?? "name");
  return `/api/employees?${sp.toString()}`;
}

export function useEmployeesList(params: EmployeesListParams) {
  return useQuery<EmployeesListResponse>({
    queryKey: [
      "employees-list",
      params.q ?? "",
      params.status ?? "",
      params.serviceIds?.join(",") ?? "",
      params.roles?.join(",") ?? "",
      params.tags?.join(",") ?? "",
      params.sort ?? "name",
      params.page ?? 1,
      params.pageSize ?? 50,
    ],
    queryFn: () => fetchApi<EmployeesListResponse>(buildUrl(params)),
    retry: 2,
    staleTime: 30_000,
  });
}
