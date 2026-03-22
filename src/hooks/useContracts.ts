"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import type { ContractType, ContractStatus, AwardLevel } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContractUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  serviceId?: string | null;
  service?: { id: string; name: string } | null;
}

export interface ContractData {
  id: string;
  userId: string;
  user: ContractUser;
  contractType: ContractType;
  awardLevel: AwardLevel | null;
  awardLevelCustom: string | null;
  payRate: number;
  hoursPerWeek: number | null;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  documentUrl: string | null;
  documentId: string | null;
  signedAt: string | null;
  acknowledgedByStaff: boolean;
  acknowledgedAt: string | null;
  notes: string | null;
  previousContractId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDetail extends ContractData {
  previousContract: {
    id: string;
    contractType: ContractType;
    payRate: number;
    startDate: string;
    endDate: string | null;
    status: ContractStatus;
  } | null;
  supersededBy: {
    id: string;
    contractType: ContractType;
    payRate: number;
    startDate: string;
    status: ContractStatus;
  }[];
}

// ── Contracts List ───────────────────────────────────────────────────────────

export function useContracts(filters?: {
  userId?: string;
  status?: string;
  serviceId?: string;
  contractType?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.userId) params.set("userId", filters.userId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.serviceId) params.set("serviceId", filters.serviceId);
  if (filters?.contractType) params.set("contractType", filters.contractType);
  if (filters?.search) params.set("search", filters.search);

  const query = params.toString();

  return useQuery<ContractData[]>({
    queryKey: ["contracts", filters],
    queryFn: () => fetchApi<ContractData[]>(`/api/contracts${query ? `?${query}` : ""}`),
    retry: 2,
  });
}

// ── Contract Detail ──────────────────────────────────────────────────────────

export function useContract(id: string | null) {
  return useQuery<ContractDetail>({
    queryKey: ["contract", id],
    queryFn: () => fetchApi<ContractDetail>(`/api/contracts/${id}`),
    enabled: !!id,
    retry: 2,
  });
}

// ── Create Contract ──────────────────────────────────────────────────────────

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      userId: string;
      contractType: string;
      awardLevel?: string | null;
      awardLevelCustom?: string | null;
      payRate: number;
      hoursPerWeek?: number | null;
      startDate: string;
      endDate?: string | null;
      status?: string;
      documentUrl?: string | null;
      documentId?: string | null;
      notes?: string | null;
      previousContractId?: string;
    }) => {
      return mutateApi("/api/contracts", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Update Contract ──────────────────────────────────────────────────────────

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      contractType?: string;
      awardLevel?: string | null;
      awardLevelCustom?: string | null;
      payRate?: number;
      hoursPerWeek?: number | null;
      startDate?: string;
      endDate?: string | null;
      status?: string;
      documentUrl?: string | null;
      documentId?: string | null;
      notes?: string | null;
    }) => {
      return mutateApi(`/api/contracts/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Supersede Contract ───────────────────────────────────────────────────────

export function useSupersedeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      contractId,
      ...data
    }: {
      id?: string;
      contractId?: string;
      contractType: string;
      awardLevel?: string | null;
      awardLevelCustom?: string | null;
      payRate: number;
      hoursPerWeek?: number | null;
      startDate: string;
      endDate?: string | null;
      status?: string;
      documentUrl?: string | null;
      documentId?: string | null;
      notes?: string | null;
    }) => {
      const targetId = id || contractId;
      return mutateApi(`/api/contracts/${targetId}/supersede`, { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Acknowledge Contract ─────────────────────────────────────────────────────

export function useAcknowledgeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      return mutateApi(`/api/contracts/${contractId}/acknowledge`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ── Terminate Contract ───────────────────────────────────────────────────────

export function useTerminateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: string | { id: string; notes?: string; endDate?: string }
    ) => {
      const id = typeof input === "string" ? input : input.id;
      const body =
        typeof input === "string" ? {} : { notes: input.notes, endDate: input.endDate };
      return mutateApi(`/api/contracts/${id}/terminate`, { method: "POST", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
