"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export type ContactMethod = "email" | "phone" | "sms" | "in_person";
export type ContactOutcome =
  | "answered"
  | "no_answer"
  | "promised_payment"
  | "disputed"
  | "payment_plan"
  | "other";

export interface FamilyBalanceContactListItem {
  id: string;
  accountName: string;
  parentName: string;
  mobileNumber: string | null;
  parentEmail: string | null;
  amountOwing: number;
  contactedAt: string;
  contactMethod: ContactMethod;
  outcome: ContactOutcome;
  outcomeNotes: string | null;
  followUpDate: string | null;
  followUpTodoId: string | null;
  serviceId: string | null;
  service: { id: string; name: string; code: string } | null;
  createdBy: { id: string; name: string | null } | null;
  followUpTodo: { id: string; status: string; dueDate: string } | null;
  createdAt: string;
}

export interface CreateFamilyBalanceContactInput {
  accountName: string;
  parentName: string;
  mobileNumber?: string | null;
  parentEmail?: string | null;
  amountOwing: number;
  contactedAt?: string;
  contactMethod: ContactMethod;
  outcome: ContactOutcome;
  outcomeNotes?: string | null;
  followUpDate?: string | null;
  serviceId?: string | null;
}

export function useFamilyBalanceContacts() {
  return useQuery<{ contacts: FamilyBalanceContactListItem[] }>({
    queryKey: ["family-balance-contacts"],
    queryFn: () => fetchApi("/api/family-balance-contacts"),
    staleTime: 30_000,
  });
}

export function useCreateFamilyBalanceContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFamilyBalanceContactInput) =>
      mutateApi<FamilyBalanceContactListItem>("/api/family-balance-contacts", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["family-balance-contacts"] });
      qc.invalidateQueries({ queryKey: ["todos"] });
      toast({
        description:
          data.outcome === "no_answer"
            ? "Contact logged — follow-up todo scheduled for tomorrow."
            : "Contact logged.",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export interface UpdateFamilyBalanceContactInput {
  id: string;
  accountName?: string;
  parentName?: string;
  mobileNumber?: string | null;
  parentEmail?: string | null;
  amountOwing?: number;
  contactedAt?: string;
  contactMethod?: ContactMethod;
  outcome?: ContactOutcome;
  outcomeNotes?: string | null;
  followUpDate?: string | null;
  serviceId?: string | null;
}

export function useUpdateFamilyBalanceContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }: UpdateFamilyBalanceContactInput) =>
      mutateApi(`/api/family-balance-contacts/${id}`, {
        method: "PATCH",
        body: rest,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["family-balance-contacts"] });
      toast({ description: "Contact updated." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}

export function useDeleteFamilyBalanceContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/family-balance-contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["family-balance-contacts"] });
      toast({ description: "Contact removed." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message });
    },
  });
}
