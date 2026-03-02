"use client";

import { useQuery } from "@tanstack/react-query";

export interface FinancialService {
  id: string;
  name: string;
  code: string;
  state: string;
  status: string;
}

export interface FinancialPeriodData {
  id: string;
  serviceId: string;
  service: FinancialService;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  bscRevenue: number;
  ascRevenue: number;
  vcRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  staffCosts: number;
  foodCosts: number;
  suppliesCosts: number;
  rentCosts: number;
  adminCosts: number;
  otherCosts: number;
  totalCosts: number;
  grossProfit: number;
  margin: number;
  bscEnrolments: number;
  ascEnrolments: number;
  bscAttendance: number;
  ascAttendance: number;
  vcAttendance: number;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;
  avgMargin: number;
  centreCount: number;
  totalBscAttendance: number;
  totalAscAttendance: number;
}

export function useFinancials(filters?: { period?: string; serviceId?: string }) {
  const params = new URLSearchParams();
  if (filters?.period) params.set("period", filters.period);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  const query = params.toString();

  return useQuery<{ financials: FinancialPeriodData[]; summary: FinancialSummary }>({
    queryKey: ["financials", filters],
    queryFn: async () => {
      const res = await fetch(`/api/financials${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch financials");
      return res.json();
    },
  });
}
