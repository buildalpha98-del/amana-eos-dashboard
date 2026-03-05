"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    queryFn: async () => {
      const res = await fetch(`/api/contracts${query ? `?${query}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    },
  });
}

// ── Contract Detail ──────────────────────────────────────────────────────────

export function useContract(id: string | null) {
  return useQuery<ContractDetail>({
    queryKey: ["contract", id],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch contract");
      return res.json();
    },
    enabled: !!id,
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
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create contract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
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
      const res = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update contract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
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
      const res = await fetch(`/api/contracts/${targetId}/supersede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to supersede contract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
    },
  });
}

// ── Acknowledge Contract ─────────────────────────────────────────────────────

export function useAcknowledgeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const res = await fetch(`/api/contracts/${contractId}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to acknowledge contract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
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
      const res = await fetch(`/api/contracts/${id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to terminate contract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
    },
  });
}
