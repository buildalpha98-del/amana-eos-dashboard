import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ProgramActivity {
  id: string;
  serviceId: string;
  weekStart: string;
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  startTime: string;
  endTime: string;
  title: string;
  description: string | null;
  staffName: string | null;
  location: string | null;
  notes: string | null;
  mtopOutcomes: number[];
  programmeBrand: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityInput {
  weekStart: string;
  day: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  staffName?: string;
  location?: string;
  notes?: string;
  mtopOutcomes?: number[];
  programmeBrand?: string;
}

export interface BulkUpsertInput {
  weekStart: string;
  activities: Omit<CreateActivityInput, "weekStart">[];
}

export function useWeeklyProgram(serviceId: string, weekStart: string) {
  return useQuery<ProgramActivity[]>({
    queryKey: ["weekly-program", serviceId, weekStart],
    queryFn: () =>
      fetchApi<ProgramActivity[]>(
        `/api/services/${serviceId}/programs?weekStart=${weekStart}`
      ),
    enabled: !!serviceId && !!weekStart,
    retry: 2,
  });
}

export function useCreateActivity(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateActivityInput) => {
      return mutateApi(`/api/services/${serviceId}/programs`, { method: "POST", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateActivity(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      activityId,
      ...data
    }: Partial<CreateActivityInput> & { activityId: string }) => {
      return mutateApi(`/api/services/${serviceId}/programs/${activityId}`, {
        method: "PATCH",
        body: data,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteActivity(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      return mutateApi(`/api/services/${serviceId}/programs/${activityId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useBulkUpsertProgram(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BulkUpsertInput) => {
      return mutateApi(`/api/services/${serviceId}/programs`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
