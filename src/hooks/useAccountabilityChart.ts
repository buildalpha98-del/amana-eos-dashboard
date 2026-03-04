import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/accountability-chart");
      if (!res.ok) throw new Error("Failed to fetch accountability chart");
      return res.json();
    },
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
      const res = await fetch("/api/accountability-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create seat");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
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
      const res = await fetch(`/api/accountability-chart/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update seat");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/accountability-chart/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete seat");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
