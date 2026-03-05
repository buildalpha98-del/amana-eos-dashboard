"use client";

import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/hooks/useToast";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred";
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            toast({
              title: "Error loading data",
              description: getErrorMessage(error),
              variant: "destructive",
            });
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
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
            retry: 1,
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
