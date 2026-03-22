import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface SeatAssignee {
  id: string;
  name: string;
  avatar: string | null;
}

export interface SeatNode {
  id: string;
  title: string;
  responsibilities: string[];
  parentId: string | null;
  order: number;
  assignees: SeatAssignee[];
  children: SeatNode[];
}

const QUERY_KEY = ["accountability-chart"];

export function useAccountabilityChart() {
  return useQuery<SeatNode[]>({
    queryKey: QUERY_KEY,
    queryFn: () => fetchApi<SeatNode[]>("/api/accountability-chart"),
    retry: 2,
  });
}

export function useCreateSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      responsibilities?: string[];
      parentId?: string | null;
      order?: number;
      assigneeIds?: string[];
    }) => {
      return mutateApi("/api/accountability-chart", { method: "POST", body: data });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useUpdateSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      responsibilities?: string[];
      parentId?: string | null;
      order?: number;
      assigneeIds?: string[];
    }) => {
      return mutateApi(`/api/accountability-chart/${id}`, { method: "PATCH", body: data });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

export function useDeleteSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return mutateApi(`/api/accountability-chart/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
