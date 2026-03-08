import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/owna/status");
      if (!res.ok) throw new Error("Failed to fetch OWNA status");
      return res.json();
    },
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
      const res = await fetch("/api/owna/mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update mapping");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owna-status"] });
    },
  });
}

// ─── Manual Sync ─────────────────────────────────────────────────────────────

export function useOwnaSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/owna/sync", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owna-status"] });
    },
  });
}
