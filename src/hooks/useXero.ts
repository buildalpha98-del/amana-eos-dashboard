import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Status ──────────────────────────────────────────────────────────────────

export function useXeroStatus() {
  return useQuery<any>({
    queryKey: ["xero-status"],
    queryFn: async () => {
      const res = await fetch("/api/xero/status");
      if (!res.ok) return { status: "disconnected" };
      return res.json();
    },
  });
}

// ─── Connect ─────────────────────────────────────────────────────────────────

export function useXeroConnect() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/xero/connect");
      if (!res.ok) throw new Error("Failed to initiate Xero connection");
      const data = await res.json();
      window.location.href = data.url;
    },
  });
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

export function useXeroDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/xero/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect Xero");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xero-status"] });
    },
  });
}

// ─── Tracking Categories ─────────────────────────────────────────────────────

export function useXeroTrackingCategories(enabled = false) {
  return useQuery<any[]>({
    queryKey: ["xero-tracking-categories"],
    queryFn: async () => {
      const res = await fetch("/api/xero/tracking-categories");
      if (!res.ok) throw new Error("Failed to fetch tracking categories");
      const data = await res.json();
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
  });
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function useXeroAccounts(enabled = false) {
  return useQuery<any[]>({
    queryKey: ["xero-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/xero/accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
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
  });
}

// ─── Mappings ────────────────────────────────────────────────────────────────

export function useXeroMappings(enabled = false) {
  return useQuery<any>({
    queryKey: ["xero-mappings"],
    queryFn: async () => {
      const res = await fetch("/api/xero/mappings");
      if (!res.ok) throw new Error("Failed to fetch mappings");
      return res.json();
    },
    enabled,
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
      const res = await fetch("/api/xero/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save mappings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xero-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["xero-status"] });
    },
  });
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export function useXeroSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (months?: number) => {
      const res = await fetch("/api/xero/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: months ?? 1 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xero-status"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
  });
}
