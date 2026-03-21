import { useQuery } from "@tanstack/react-query";
import type { NetworkSummary } from "@/lib/staffing-analysis";

interface StaffingDashboardData {
  today: NetworkSummary;
  tomorrow: NetworkSummary;
}

export function useStaffingDashboard() {
  return useQuery<StaffingDashboardData>({
    queryKey: ["dashboard-staffing"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/staffing");
      if (!res.ok) throw new Error("Failed to fetch staffing data");
      return res.json();
    },
    refetchInterval: 5 * 60_000, // 5 minutes
  });
}

export function useServiceStaffing(serviceId: string, weekStart?: string) {
  return useQuery({
    queryKey: ["service-staffing", serviceId, weekStart],
    queryFn: async () => {
      const sp = new URLSearchParams({ serviceId });
      if (weekStart) sp.set("weekStart", weekStart);
      const res = await fetch(`/api/services/staffing?${sp}`);
      if (!res.ok) throw new Error("Failed to fetch service staffing");
      return res.json();
    },
    enabled: !!serviceId,
  });
}
