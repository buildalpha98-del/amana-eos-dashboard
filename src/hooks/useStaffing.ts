import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { NetworkSummary } from "@/lib/staffing-analysis";

interface StaffingDashboardData {
  today: NetworkSummary;
  tomorrow: NetworkSummary;
}

export function useStaffingDashboard() {
  return useQuery<StaffingDashboardData>({
    queryKey: ["dashboard-staffing"],
    queryFn: () => fetchApi<StaffingDashboardData>("/api/dashboard/staffing"),
    retry: 2,
    refetchInterval: 5 * 60_000, // 5 minutes
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useServiceStaffing(serviceId: string, weekStart?: string) {
  return useQuery<any>({
    queryKey: ["service-staffing", serviceId, weekStart],
    queryFn: () => {
      const sp = new URLSearchParams({ serviceId });
      if (weekStart) sp.set("weekStart", weekStart);
      return fetchApi(`/api/services/staffing?${sp}`);
    },
    retry: 2,
    enabled: !!serviceId,
  });
}
