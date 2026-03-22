import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OwnaService {
  id: string;
  name: string;
  code: string;
  ownaServiceId: string | null;
  ownaLocationId: string | null;
  ownaSyncedAt: string | null;
}

interface OwnaStatus {
  configured: boolean;
  services: OwnaService[];
  mappedCount: number;
  totalServices: number;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function useOwnaStatus() {
  return useQuery<OwnaStatus>({
    queryKey: ["owna-status"],
    queryFn: () => fetchApi<OwnaStatus>("/api/owna/status"),
    retry: 2,
  });
}

// ─── Update Mapping ──────────────────────────────────────────────────────────

export function useUpdateOwnaMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      serviceId: string;
      ownaServiceId: string | null;
      ownaLocationId?: string | null;
    }) => {
      return mutateApi("/api/owna/mapping", { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owna-status"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ─── Manual Sync ─────────────────────────────────────────────────────────────

export function useOwnaSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return mutateApi("/api/owna/sync", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owna-status"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
