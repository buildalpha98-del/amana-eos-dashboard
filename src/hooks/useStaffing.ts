import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { NetworkSummary, WeekAnalysis } from "@/lib/staffing-analysis";

interface StaffingDashboardData {
  today: NetworkSummary;
  tomorrow: NetworkSummary;
}

interface ServiceStaffingData {
  week: WeekAnalysis;
  monthlyOverstaffCost: number;
}

export function useStaffingDashboard() {
  return useQuery<StaffingDashboardData>({
    staleTime: 30_000,
    queryKey: ["dashboard-staffing"],
    queryFn: () => fetchApi<StaffingDashboardData>("/api/dashboard/staffing"),
    retry: 2,
    refetchInterval: 5 * 60_000, // 5 minutes
  });
}

 
export function useServiceStaffing(serviceId: string, weekStart?: string) {
  return useQuery<ServiceStaffingData>({
    staleTime: 30_000,
    queryKey: ["service-staffing", serviceId, weekStart],
    queryFn: () => {
      const sp = new URLSearchParams({ serviceId });
      if (weekStart) sp.set("weekStart", weekStart);
      return fetchApi<ServiceStaffingData>(`/api/services/staffing?${sp}`);
    },
    retry: 2,
    enabled: !!serviceId,
  });
}
