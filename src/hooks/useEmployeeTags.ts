"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

/**
 * Distinct tags applied to any user the caller can see, sorted
 * alphabetically. Drives the /team Tag filter dropdown. Cached for
 * 5 min so the dropdown opens instantly on re-render without
 * refetching every keypress.
 */
export function useEmployeeTags() {
  return useQuery<{ tags: string[] }>({
    queryKey: ["employee-tags"],
    queryFn: () => fetchApi<{ tags: string[] }>("/api/employees/tags"),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}
