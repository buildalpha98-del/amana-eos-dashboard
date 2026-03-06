import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    queryFn: async () => {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      return res.json();
    },
  });
}

/** Create a new API key — returns plaintext key ONCE */
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation<CreateApiKeyResponse, Error, CreateApiKeyInput>({
    mutationFn: async (data) => {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create API key");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

/** Revoke (soft-delete) an API key */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to revoke API key");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
