"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { CreateParentPostInput, UpdateParentPostInput } from "@/lib/schemas/parent-post";

export interface ParentPostChild {
  id: string;
  firstName: string;
  surname: string;
}

export interface ParentPostTag {
  id: string;
  childId: string;
  child: ParentPostChild;
}

export interface ParentPostAuthor {
  id: string;
  name: string | null;
  avatar: string | null;
}

export interface ParentPost {
  id: string;
  serviceId: string;
  title: string;
  content: string;
  type: string;
  mediaUrls: string[];
  authorId: string | null;
  author: ParentPostAuthor | null;
  isCommunity: boolean;
  createdAt: string;
  updatedAt: string;
  tags: ParentPostTag[];
  likeCount?: number;
  commentCount?: number;
}

export interface StaffParentPostComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorType: "parent" | "staff";
}

interface ParentPostsResponse {
  items: ParentPost[];
  nextCursor?: string;
}

export function useParentPosts(serviceId: string) {
  return useQuery<ParentPostsResponse>({
    queryKey: ["parent-posts", serviceId],
    queryFn: () => fetchApi<ParentPostsResponse>(`/api/services/${serviceId}/parent-posts`),
    enabled: !!serviceId,
    staleTime: 30_000,
    retry: 2,
  });
}

export function useCreateParentPost(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateParentPostInput) =>
      mutateApi<ParentPost>(`/api/services/${serviceId}/parent-posts`, {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-posts", serviceId] });
      toast({ description: "Post created successfully" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to create post" });
    },
  });
}

export function useUpdateParentPost(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, ...data }: UpdateParentPostInput & { postId: string }) =>
      mutateApi<ParentPost>(`/api/services/${serviceId}/parent-posts/${postId}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-posts", serviceId] });
      toast({ description: "Post updated" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to update post" });
    },
  });
}

export function useDeleteParentPost(serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      mutateApi(`/api/services/${serviceId}/parent-posts/${postId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-posts", serviceId] });
      toast({ description: "Post deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to delete post" });
    },
  });
}

// ── Comment thread (staff view) ─────────────────────────

interface StaffCommentsResponse {
  items: StaffParentPostComment[];
  nextCursor?: string;
}

export function useStaffPostComments(
  serviceId: string,
  postId: string | null,
) {
  return useQuery<StaffCommentsResponse>({
    queryKey: ["staff-post-comments", serviceId, postId],
    queryFn: () =>
      fetchApi<StaffCommentsResponse>(
        `/api/services/${serviceId}/parent-posts/${postId}/comments?limit=50`,
      ),
    enabled: !!postId,
    staleTime: 15_000,
    retry: 2,
  });
}

export function useStaffReplyToPost(serviceId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      mutateApi<StaffParentPostComment>(
        `/api/services/${serviceId}/parent-posts/${postId}/comments`,
        {
          method: "POST",
          body: { body },
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-post-comments", serviceId, postId] });
      queryClient.invalidateQueries({ queryKey: ["parent-posts", serviceId] });
      toast({ description: "Reply sent" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to reply" });
    },
  });
}

export function useDeleteStaffPostComment(serviceId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      mutateApi(
        `/api/services/${serviceId}/parent-posts/${postId}/comments/${commentId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-post-comments", serviceId, postId] });
      queryClient.invalidateQueries({ queryKey: ["parent-posts", serviceId] });
      toast({ description: "Comment removed" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to remove" });
    },
  });
}
