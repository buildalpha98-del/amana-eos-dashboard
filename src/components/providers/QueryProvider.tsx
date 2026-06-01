"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "@/hooks/useToast";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}

function is401(error: unknown): boolean {
  if (error instanceof Error && error.message.includes("401")) return true;
  // Check for Response-like objects with status
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: number }).status === 401
  )
    return true;
  return false;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Prevent multiple 401 redirects firing at once
  const isRedirecting = useRef(false);

  const handleSessionExpired = () => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    toast({ description: "Session expired. Please sign in again." });
    setTimeout(() => {
      window.location.href = "/login";
    }, 800);
  };

  // Forward-declared so MutationCache.onSuccess (defined inside the
  // QueryClient constructor) can invalidate everything on the same
  // client. The ref is filled in immediately after construction so the
  // very first mutation already sees it populated.
  const clientRef = useRef<QueryClient | null>(null);

  const [queryClient] = useState(() => {
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => {
          if (is401(error)) {
            handleSessionExpired();
            return;
          }
          toast({
            title: "Error loading data",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        },
      }),
      mutationCache: new MutationCache({
        // ──────────────────────────────────────────────────────────────
        // 2026-06-02: Global refresh-on-save.
        // ──────────────────────────────────────────────────────────────
        // Every successful mutation invalidates ALL active queries. This
        // mirrors the "page reloads after save" behaviour users expect
        // from traditional server-rendered apps — most mutation hooks
        // already invalidate the relevant keys, but coverage was patchy
        // (staff profile edits, attendance changes, certificate uploads,
        // etc. could end up showing stale data until manual refresh).
        //
        // Trade-off: a single save triggers a refetch on every mounted
        // query, which is slightly wasteful. For an internal dashboard
        // with <50 concurrent queries on any one page, the cost is
        // imperceptible and the UX win is large. Per-hook
        // `invalidateQueries` calls remain — they're just no longer
        // load-bearing.
        onSuccess: () => {
          clientRef.current?.invalidateQueries();
        },
        onError: (error, _variables, _context, mutation) => {
          if (is401(error)) {
            handleSessionExpired();
            return;
          }
          // Only fire the global toast when the mutation doesn't already have
          // its own onError handler. Otherwise the user sees two identical
          // toasts (one from the hook's onError, one from here).
          if (mutation.options.onError) return;
          toast({
            title: "Action failed",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          // 2026-06-02: turning this on so coming back to a tab fetches
          // fresh data — same intent as the mutation-cache invalidation
          // above. Saves the "leave and come back" workaround users were
          // reporting on the staff profile.
          refetchOnWindowFocus: true,
          retry: (failureCount, error) => {
            // Never retry on 401 — session is expired, retrying won't help
            if (is401(error)) return false;
            return failureCount < 1;
          },
        },
        mutations: {
          retry: 0,
        },
      },
    });
    clientRef.current = client;
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
