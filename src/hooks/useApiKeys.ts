import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ── Types ─────────────────────────────────────────────────────

export interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: string;
}

export interface CreateApiKeyResponse extends Omit<ApiKeyData, "createdBy" | "revokedAt" | "lastUsedAt"> {
  plaintext: string;
}

// ── Hooks ─────────────────────────────────────────────────────

/** Fetch all API keys (owner only) */
export function useApiKeys() {
  return useQuery<ApiKeyData[]>({
    queryKey: ["api-keys"],
    queryFn: () => fetchApi<ApiKeyData[]>("/api/settings/api-keys"),
    retry: 2,
  });
}

/** Create a new API key — returns plaintext key ONCE */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation<CreateApiKeyResponse, Error, CreateApiKeyInput>({
    mutationFn: async (data) => {
      return mutateApi<CreateApiKeyResponse>("/api/settings/api-keys", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}

/** Revoke (soft-delete) an API key */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      return mutateApi<void>(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });
}
