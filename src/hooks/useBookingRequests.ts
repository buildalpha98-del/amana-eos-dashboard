"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

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
  sessionType: string;
  status: string;
  type: string;
  notes: string | null;
  createdAt: string;
  child: {
    id: string;
    firstName: string;
    surname: string;
    enrolment: {
      primaryParent: BookingRequestParent | null;
    };
  };
}

interface BookingRequestsResponse {
  items: BookingRequest[];
  nextCursor?: string;
}

export function useBookingRequests(serviceId: string) {
  return useQuery<BookingRequestsResponse>({
    queryKey: ["booking-requests", serviceId],
    queryFn: () => fetchApi<BookingRequestsResponse>(`/api/services/${serviceId}/booking-requests`),
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
