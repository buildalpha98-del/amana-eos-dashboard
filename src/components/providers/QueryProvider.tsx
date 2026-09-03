"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/hooks/useToast";
import { isPublicParentRoute } from "@/lib/parent-routes";

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

// Prevent multiple 401 redirects firing at once. Module-level (rather than a
// ref) because the handler runs from cache callbacks, never during render —
// and the provider is a mounted-once singleton anyway.
let isRedirecting = false;

function handleSessionExpired() {
  if (isRedirecting) return;
  isRedirecting = true;
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";

  // 2026-07-30: on a PUBLIC parent page (login, signup, confirm) there is
  // no session to expire — the visitor hasn't got one yet, by definition.
  // A 401 there means a stray authenticated request fired, which is a bug
  // to fix at the source, but it must never produce a "session expired"
  // toast or a redirect: the redirect reloads the page, remounts whatever
  // 401'd, and loops. Suppress entirely and log so it stays findable.
  //
  // Deliberately keyed on the ROUTE rather than on "am I already at the
  // redirect target" — an earlier version only matched the target, which
  // silenced /parent/login while leaving /parent/signup looping.
  if (isPublicParentRoute(pathname)) {
    isRedirecting = false;
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[auth] 401 on public parent route — an authenticated query is " +
          "firing for a signed-out visitor:",
        pathname,
      );
    }
    return;
  }

  // Parents were being bounced to the STAFF login, where their
  // credentials don't work — a dead end that reads as "my account is
  // broken". Send them to their own sign-in instead.
  const target = pathname.startsWith("/parent") ? "/parent/login" : "/login";
  toast({ description: "Session expired. Please sign in again." });
  setTimeout(() => {
    window.location.href = target;
  }, 800);
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    // MutationCache.onSuccess (defined inside the QueryClient constructor)
    // invalidates everything on this same client via closure — legal because
    // the callback only runs after construction completes.
    const client: QueryClient = new QueryClient({
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
          client.invalidateQueries();
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
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
