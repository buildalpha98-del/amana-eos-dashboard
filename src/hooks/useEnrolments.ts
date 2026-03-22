"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

export interface EnrolmentSubmission {
  id: string;
  token: string;
  enquiryId: string | null;
  serviceId: string | null;
  primaryParent: {
    firstName: string;
    surname: string;
    email: string;
    mobile: string;
    relationship: string;
    [key: string]: unknown;
  };
  secondaryParent?: {
    firstName: string;
    surname: string;
    [key: string]: unknown;
  } | null;
  children: Array<{
    firstName: string;
    surname: string;
    dob: string;
    gender: string;
    medical?: Record<string, unknown>;
    bookingPrefs?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  emergencyContacts: Array<{
    name: string;
    relationship: string;
    phone: string;
    email: string;
  }>;
  consents: Record<string, boolean>;
  paymentMethod: string | null;
  paymentDetails: Record<string, unknown> | null;
  referralSource: string | null;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  debitAgreement: boolean;
  courtOrders: boolean;
  status: string;
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface EnrolmentsResponse {
  submissions: EnrolmentSubmission[];
  total: number;
}

export function useEnrolments(status?: string) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  params.set("limit", "100");

  return useQuery<EnrolmentsResponse>({
    queryKey: ["enrolments", status || "all"],
    queryFn: () => fetchApi<EnrolmentsResponse>(`/api/enrolments?${params}`),
    retry: 2,
  });
}

export function useEnrolment(id: string | null) {
  return useQuery<EnrolmentSubmission>({
    queryKey: ["enrolment", id],
    queryFn: () => fetchApi<EnrolmentSubmission>(`/api/enrolments/${id}`),
    enabled: Boolean(id),
    retry: 2,
  });
}

export function useUpdateEnrolment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; notes?: string }) => {
      return mutateApi<EnrolmentSubmission>(`/api/enrolments/${id}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrolments"] });
      queryClient.invalidateQueries({ queryKey: ["enrolment"] });
      toast({ description: "Enrolment updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
