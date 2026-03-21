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

  const [queryClient] = useState(
    () =>
      new QueryClient({
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
          onError: (error) => {
            if (is401(error)) {
              handleSessionExpired();
              return;
            }
            // Only fire global toast if the mutation doesn't have its own onError
            // Mutations with inline onError already handle the error (e.g. form validation)
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
            refetchOnWindowFocus: false,
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
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
