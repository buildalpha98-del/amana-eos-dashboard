import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch(
        `/api/services/${serviceId}/programs?weekStart=${weekStart}`
      );
      if (!res.ok) throw new Error("Failed to fetch program");
      return res.json();
    },
    enabled: !!serviceId && !!weekStart,
  });
}

export function useCreateActivity(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateActivityInput) => {
      const res = await fetch(`/api/services/${serviceId}/programs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.formErrors?.[0] || "Failed to create activity");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
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
      const res = await fetch(
        `/api/services/${serviceId}/programs/${activityId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error("Failed to update activity");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
  });
}

export function useDeleteActivity(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      const res = await fetch(
        `/api/services/${serviceId}/programs/${activityId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete activity");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
  });
}

export function useBulkUpsertProgram(serviceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: BulkUpsertInput) => {
      const res = await fetch(`/api/services/${serviceId}/programs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save program");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-program", serviceId] });
    },
  });
}
