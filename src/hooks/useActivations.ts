import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface ActivationRow {
  id: string;
  status: string;
  activationDeliveredAt: string | null;
  budget: number | null;
  campaign: { id: string; name: string; type: string; startDate: string | null; endDate: string | null };
  service: { id: string; name: string; code: string };
  recapPostId: string | null;
  recapPostStatus: string | null;
}

const KEY = "marketing-activations";

function destructive(err: Error) {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
}

export function useActivations() {
  return useQuery<{ activations: ActivationRow[] }>({
    queryKey: [KEY],
    queryFn: () => fetchApi<{ activations: ActivationRow[] }>("/api/marketing/activations"),
    retry: 2,
    staleTime: 30_000,
  });
}

export function useMarkDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, undo }: { id: string; undo?: boolean }) =>
      mutateApi(`/api/marketing/activations/${id}/mark-delivered`, {
        method: "POST",
        body: { undo: undo ?? false },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: destructive,
  });
}
