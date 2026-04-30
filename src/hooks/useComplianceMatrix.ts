"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import type { CertStatus } from "@/lib/cert-status";

export interface MatrixCertEntry {
  type: string;
  status: CertStatus;
  expiryDate: string | null;
  daysLeft: number | null;
}

export interface MatrixRow {
  userId: string;
  userName: string;
  serviceName: string;
  serviceCode: string;
  certs: MatrixCertEntry[];
  validCount: number;
  totalRequired: number;
}

export interface MatrixSummary {
  totalStaff: number;
  fullyCompliant: number;
  atRisk: number;
  nonCompliant: number;
}

export interface ComplianceMatrixData {
  rows: MatrixRow[];
  summary: MatrixSummary;
}

export function useComplianceMatrix(serviceId?: string) {
  return useQuery<ComplianceMatrixData>({
    queryKey: ["compliance-matrix", serviceId ?? null],
    queryFn: () => {
      const url = serviceId
        ? `/api/compliance/matrix?serviceId=${encodeURIComponent(serviceId)}`
        : "/api/compliance/matrix";
      return fetchApi<ComplianceMatrixData>(url);
    },
    retry: 2,
    staleTime: 30_000,
  });
}
