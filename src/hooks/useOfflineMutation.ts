"use client";

/**
 * useOfflineMutation — wraps a POST/PATCH with offline-queue semantics.
 *
 * Behaviour:
 *   - Happy path (online + server reachable): fires fetch, returns response.
 *   - Network error: enqueues the mutation to IndexedDB, returns a stub
 *     success so the UI can show optimistic state. Drains on `online` event.
 *   - 4xx: surfaces the error immediately — user input needs correction.
 *
 * Every mutation MUST carry a `clientMutationId` UUID. The server's unique
 * index guarantees exactly-once insertion even if the client replays.
 */

import { useCallback, useState } from "react";
import { offlineQueue } from "@/lib/offline-queue";
import { toast } from "@/hooks/useToast";

export interface OfflineMutationOptions<T = unknown> {
  /** API endpoint. */
  url: string;
  method?: "POST" | "PATCH" | "PUT";
  /** Optimistic value returned when the mutation is queued. */
  optimistic?: T;
  /** Called on successful server response. */
  onSuccess?: (data: T) => void;
  /** Called when the mutation is queued offline. */
  onQueued?: () => void;
}

export function useOfflineMutation<T = unknown>(
  opts: OfflineMutationOptions<T>,
) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fire = useCallback(
    async (body: Record<string, unknown> & { clientMutationId: string }): Promise<{
      ok: boolean;
      queued: boolean;
      data?: T;
    }> => {
      setIsPending(true);
      setError(null);
      try {
        const res = await fetch(opts.url, {
          method: opts.method ?? "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = (await res.json()) as T;
          opts.onSuccess?.(data);
          return { ok: true, queued: false, data };
        }

        // 4xx — surface to the user, don't queue
        if (res.status >= 400 && res.status < 500) {
          const errBody = (await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
          const msg = errBody.error ?? `HTTP ${res.status}`;
          setError(msg);
          toast({ variant: "destructive", description: msg });
          return { ok: false, queued: false };
        }

        // 5xx — queue + return optimistic
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Network error or 5xx — enqueue
        await offlineQueue.enqueue({
          id: body.clientMutationId,
          url: opts.url,
          method: opts.method ?? "POST",
          body,
        });
        opts.onQueued?.();
        toast({
          description: "Saved offline — will sync when you're back online.",
        });
        return { ok: true, queued: true, data: opts.optimistic };
      } finally {
        setIsPending(false);
      }
    },
    [opts],
  );

  return { fire, isPending, error };
}
