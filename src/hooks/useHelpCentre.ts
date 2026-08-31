"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface HelpCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
  published: boolean;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HelpArticleRow {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  body: string;
  sortOrder: number;
  published: boolean;
  viewCount: number;
  updatedAt: string;
  category: { name: string; slug: string };
}

export interface HelpCategoryInput {
  name?: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  published?: boolean;
}

export interface HelpArticleInput {
  categoryId?: string;
  title?: string;
  body?: string;
  sortOrder?: number;
  published?: boolean;
}

const onError = (err: Error) => {
  toast({ variant: "destructive", description: err.message || "Something went wrong" });
};

export function useHelpCategories() {
  return useQuery({
    queryKey: ["help-centre-categories"],
    queryFn: () => fetchApi<{ categories: HelpCategoryRow[] }>("/api/help-centre/categories"),
    select: (d) => d.categories,
    retry: 2,
    staleTime: 30_000,
  });
}

export function useHelpArticles(categoryId?: string) {
  return useQuery({
    queryKey: ["help-centre-articles", categoryId ?? "all"],
    queryFn: () =>
      fetchApi<{ articles: HelpArticleRow[] }>(
        categoryId
          ? `/api/help-centre/articles?categoryId=${encodeURIComponent(categoryId)}`
          : "/api/help-centre/articles",
      ),
    select: (d) => d.articles,
    retry: 2,
    staleTime: 30_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["help-centre-categories"] });
    qc.invalidateQueries({ queryKey: ["help-centre-articles"] });
  };
}

export function useCreateHelpCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: HelpCategoryInput & { name: string }) =>
      mutateApi<{ category: HelpCategoryRow }>("/api/help-centre/categories", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Category created" });
    },
    onError,
  });
}

export function useUpdateHelpCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: HelpCategoryInput & { id: string }) =>
      mutateApi<{ category: HelpCategoryRow }>(`/api/help-centre/categories/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => invalidate(),
    onError,
  });
}

export function useDeleteHelpCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ ok: boolean }>(`/api/help-centre/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Category deleted" });
    },
    onError,
  });
}

export function useCreateHelpArticle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: HelpArticleInput & { categoryId: string; title: string; body: string }) =>
      mutateApi<{ article: HelpArticleRow }>("/api/help-centre/articles", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Article created" });
    },
    onError,
  });
}

export function useUpdateHelpArticle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: HelpArticleInput & { id: string }) =>
      mutateApi<{ article: HelpArticleRow }>(`/api/help-centre/articles/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => invalidate(),
    onError,
  });
}

export function useDeleteHelpArticle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi<{ ok: boolean }>(`/api/help-centre/articles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Article deleted" });
    },
    onError,
  });
}
