import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ─── Status ──────────────────────────────────────────────────────────────────

// Special error handling: returns default on failure — keep raw fetch
export function useXeroStatus() {
  return useQuery<any>({
    queryKey: ["xero-status"],
    queryFn: async () => {
      const res = await fetch("/api/xero/status");
      if (!res.ok) return { status: "disconnected" };
      return res.json();
    },
    retry: 2,
  });
}

// ─── Connect ─────────────────────────────────────────────────────────────────

// Special handling: redirects via window.location — keep raw fetch
export function useXeroConnect() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/xero/connect");
      if (!res.ok) throw new Error("Failed to initiate Xero connection");
      const data = await res.json();
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

export function useXeroDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return mutateApi("/api/xero/disconnect", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xero-status"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ─── Tracking Categories ─────────────────────────────────────────────────────

export function useXeroTrackingCategories(enabled = false) {
  return useQuery<any[]>({
    queryKey: ["xero-tracking-categories"],
    queryFn: async () => {
      const data = await fetchApi<any[]>("/api/xero/tracking-categories");
      // Normalize Xero PascalCase to lowercase for component use
      return (data || []).map((cat: any) => ({
        id: cat.TrackingCategoryID,
        name: cat.Name,
        status: cat.Status,
        options: (cat.Options || []).map((opt: any) => ({
          id: opt.TrackingOptionID,
          name: opt.Name,
          status: opt.Status,
        })),
      }));
    },
    enabled,
    retry: 2,
  });
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function useXeroAccounts(enabled = false) {
  return useQuery<any[]>({
    queryKey: ["xero-accounts"],
    queryFn: async () => {
      const data = await fetchApi<any[]>("/api/xero/accounts");
      // Normalize Xero PascalCase to lowercase for component use
      // Also keep originals for the save handler
      return (data || []).map((acc: any) => ({
        id: acc.Code,
        code: acc.Code,
        name: acc.Name,
        type: acc.Type || acc.Class,
        Code: acc.Code,
        Name: acc.Name,
        Type: acc.Type,
        Class: acc.Class,
      }));
    },
    enabled,
    retry: 2,
  });
}

// ─── Mappings ────────────────────────────────────────────────────────────────

export function useXeroMappings(enabled = false) {
  return useQuery<any>({
    queryKey: ["xero-mappings"],
    queryFn: async () => {
      return fetchApi("/api/xero/mappings");
    },
    enabled,
    retry: 2,
  });
}

export function useSaveXeroMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      trackingCategoryId: string;
      centreMappings: { serviceId: string; xeroTrackingOptionId: string }[];
      accountMappings: {
        xeroAccountCode: string;
        xeroAccountName: string;
        xeroAccountType: string;
        localCategory: string;
      }[];
    }) => {
      return mutateApi("/api/xero/mappings", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xero-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["xero-status"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export function useXeroSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (months?: number) => {
      return mutateApi("/api/xero/sync", {
        method: "POST",
        body: { months: months ?? 1 },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xero-status"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
