"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export type ContractCustomTag = {
  id: string;
  key: string;        // always "custom.<camelCaseName>"
  label: string;
  createdAt: string;
};

const QUERY_KEY = ["contract-custom-tags"] as const;

export function useContractCustomTags() {
  return useQuery<ContractCustomTag[]>({
    queryKey: QUERY_KEY,
    queryFn: () =>
      fetchApi<ContractCustomTag[]>("/api/contract-templates/custom-tags"),
    retry: 2,
    staleTime: 60_000,
  });
}

export function useCreateContractCustomTag() {
  const qc = useQueryClient();
  return useMutation<ContractCustomTag, Error, { label: string }>({
    mutationFn: ({ label }) =>
      mutateApi<ContractCustomTag>("/api/contract-templates/custom-tags", {
        method: "POST",
        body: { label },
      }),
    onSuccess: (created) => {
      // Append to cache so the new pill shows instantly without waiting
      // on the refetch.
      qc.setQueryData<ContractCustomTag[]>(QUERY_KEY, (old) =>
        old ? [...old, created].sort((a, b) => a.label.localeCompare(b.label)) : [created],
      );
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't save tag",
      });
    },
  });
}

export function useDeleteContractCustomTag() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string }>({
    mutationFn: ({ id }) =>
      mutateApi(`/api/contract-templates/custom-tags/${id}`, {
        method: "DELETE",
      }),
    onMutate: async ({ id }) => {
      // Optimistic remove so the pill disappears immediately. If the
      // DELETE rejects, restore from snapshot.
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const snapshot = qc.getQueryData<ContractCustomTag[]>(QUERY_KEY);
      qc.setQueryData<ContractCustomTag[]>(QUERY_KEY, (old) =>
        old?.filter((t) => t.id !== id),
      );
      return { snapshot };
    },
    onError: (err, _vars, context) => {
      const snapshot = (context as { snapshot?: ContractCustomTag[] } | undefined)?.snapshot;
      if (snapshot) {
        qc.setQueryData(QUERY_KEY, snapshot);
      }
      toast({
        variant: "destructive",
        description: err.message || "Couldn't delete tag",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
