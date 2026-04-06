"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

// ── Types ──────────────────────────────────────────────────

export interface BookingRequestParent {
  firstName: string;
  surname: string;
  email: string;
  mobile: string;
}

export interface BookingRequest {
  id: string;
  childId: string;
  serviceId: string;
  date: string;
  sessionType: "bsc" | "asc" | "vc";
  status: string;
  type: string;
  fee: number | null;
  declineReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  child: {
    id: string;
    firstName: string;
    surname: string;
    photo: string | null;
    dob: string | null;
    yearLevel: string | null;
    enrolment?: {
      primaryParent: BookingRequestParent | null;
    };
  };
  service: {
    id: string;
    name: string;
    code: string;
  };
  requestedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

interface BookingRequestsResponse {
  bookings: BookingRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Legacy response shape (for service-scoped hook)
interface LegacyBookingRequestsResponse {
  items: BookingRequest[];
  nextCursor?: string;
}

// ── Legacy service-scoped hook (backward compat) ───────────

export function useBookingRequests(serviceId: string) {
  return useQuery<LegacyBookingRequestsResponse>({
    queryKey: ["booking-requests", serviceId],
    queryFn: () => fetchApi<LegacyBookingRequestsResponse>(`/api/services/${serviceId}/booking-requests`),
    enabled: !!serviceId,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useUpdateBookingStatus(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookingId: string; status: "confirmed" | "cancelled" }) =>
      mutateApi(`/api/services/${serviceId}/booking-requests`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["booking-requests", serviceId] });
      const action = variables.status === "confirmed" ? "approved" : "rejected";
      toast({ description: `Booking ${action} successfully` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to update booking" });
    },
  });
}

// ── Centralized booking requests hook (new inbox) ──────────

export function useAllBookingRequests(filters?: {
  serviceId?: string;
  status?: string;
  page?: number;
}) {
  const status = filters?.status || "requested";
  const serviceId = filters?.serviceId || "";
  const page = filters?.page || 1;

  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (status) params.set("status", status);
  params.set("page", String(page));

  return useQuery<BookingRequestsResponse>({
    queryKey: ["booking-requests-all", serviceId, status, page],
    queryFn: () => fetchApi<BookingRequestsResponse>(`/api/bookings/requests?${params}`),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── Pending count (for nav badge) ──────────────────────────

export function useBookingRequestCount() {
  return useQuery<number>({
    queryKey: ["booking-request-count"],
    queryFn: async () => {
      const res = await fetchApi<BookingRequestsResponse>("/api/bookings/requests?status=requested&limit=1");
      return res.total;
    },
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── Approve mutation ───────────────────────────────────────

export function useApproveBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      mutateApi(`/api/bookings/${bookingId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-requests-all"] });
      queryClient.invalidateQueries({ queryKey: ["booking-request-count"] });
      toast({ description: "Booking approved" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to approve booking" });
    },
  });
}

// ── Decline mutation ───────────────────────────────────────

export function useDeclineBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      mutateApi(`/api/bookings/${bookingId}/decline`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-requests-all"] });
      queryClient.invalidateQueries({ queryKey: ["booking-request-count"] });
      toast({ description: "Booking declined" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to decline booking" });
    },
  });
}
