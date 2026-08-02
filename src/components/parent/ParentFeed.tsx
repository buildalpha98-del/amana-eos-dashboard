"use client";

/**
 * The family's feed of posts from their child's service.
 *
 * 2026-08-01, per Daniel: an Instagram-style home section so parents can
 * see what staff post about their children.
 *
 * The pieces for this ALREADY existed and were simply never surfaced:
 * GET /api/parent/timeline (correctly scoped — community posts plus posts
 * tagging this family's children, never another service's), and
 * like/comment endpoints. Staff have had a composer at
 * /services/[id]/parent-communication the whole time. What was missing
 * was any way for a parent to SEE the result, so every post staff wrote
 * went nowhere.
 */

import { useState } from "react";
import Image from "next/image";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Loader2, Camera } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { SectionLabel } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";

interface FeedPost {
  id: string;
  title: string;
  content: string;
  type: string;
  mediaUrls: string[];
  createdAt: string;
  isCommunity: boolean;
  author: { id: string; name: string | null; avatar: string | null } | null;
  tags: { child: { id: string; firstName: string; surname: string } }[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

interface FeedPage {
  items: FeedPost[];
  nextCursor?: string;
}

/** "2h ago", "Yesterday", "3 Aug" — feeds read badly with absolute stamps. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function ParentFeed() {
  const qc = useQueryClient();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<FeedPage>({
      queryKey: ["parent", "timeline"],
      queryFn: ({ pageParam }) =>
        fetchApi(
          `/api/parent/timeline?limit=10` +
            (pageParam ? `&cursor=${encodeURIComponent(String(pageParam))}` : ""),
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor,
      retry: 1,
    });

  const posts = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <section>
        <SectionLabel label="What's happening" />
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
        </div>
      </section>
    );
  }

  // An empty feed is normal for a new family — don't dress it up as an
  // error, and don't render a heading over nothing.
  if (posts.length === 0) return null;

  return (
    <section aria-label="Service updates">
      <SectionLabel label="What's happening" />
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onChanged={() => qc.invalidateQueries({ queryKey: ["parent", "timeline"] })} />
        ))}
      </div>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full mt-4 min-h-11 rounded-lg border border-[color:var(--color-border)] text-sm font-medium text-[color:var(--color-muted)]"
        >
          {isFetchingNextPage ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </span>
          ) : (
            "Show older posts"
          )}
        </button>
      )}
    </section>
  );
}

function PostCard({
  post,
  onChanged,
}: {
  post: FeedPost;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  const like = useMutation({
    mutationFn: () =>
      mutateApi(`/api/parent/posts/${post.id}/like`, { method: "POST", body: {} }),
    // Optimistic: a heart that waits for a round trip feels broken.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["parent", "timeline"] });
      const prev = qc.getQueryData(["parent", "timeline"]);
      qc.setQueryData(["parent", "timeline"], (old: unknown) => {
        const d = old as { pages: FeedPage[] } | undefined;
        if (!d) return old;
        return {
          ...d,
          pages: d.pages.map((pg) => ({
            ...pg,
            items: pg.items.map((it) =>
              it.id === post.id
                ? {
                    ...it,
                    likedByMe: !it.likedByMe,
                    likeCount: it.likeCount + (it.likedByMe ? -1 : 1),
                  }
                : it,
            ),
          })),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      // Put the heart back rather than leaving a lie on screen.
      if (ctx?.prev) qc.setQueryData(["parent", "timeline"], ctx.prev);
    },
    onSettled: onChanged,
  });

  const addComment = useMutation({
    mutationFn: (body: { content: string }) =>
      mutateApi(`/api/parent/posts/${post.id}/comments`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      setComment("");
      setShowComment(false);
      onChanged();
      toast({ description: "Comment added." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const taggedNames = post.tags
    .map((t) => t.child.firstName)
    .filter(Boolean);

  return (
    <article className="warm-card overflow-hidden">
      <header className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0 text-sm font-semibold text-[color:var(--color-brand)]">
          {(post.author?.name ?? "A").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--color-foreground)] truncate">
            {post.author?.name ?? "Amana OSHC"}
          </p>
          <p className="text-xs text-[color:var(--color-muted)]">
            {timeAgo(post.createdAt)}
            {taggedNames.length > 0 && ` · with ${taggedNames.join(", ")}`}
          </p>
        </div>
      </header>

      {post.title && (
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] mb-1">
          {post.title}
        </h3>
      )}
      <p className="text-sm text-[color:var(--color-foreground)]/85 leading-relaxed whitespace-pre-wrap">
        {post.content}
      </p>

      {post.mediaUrls.length > 0 && (
        <div
          className={
            "mt-3 grid gap-1.5 " +
            (post.mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2")
          }
        >
          {post.mediaUrls.slice(0, 4).map((url, i) => (
            <div
              key={url}
              className="relative aspect-square rounded-lg overflow-hidden bg-[color:var(--color-surface)]"
            >
              <Image
                src={url}
                alt={post.title || "Post photo"}
                fill
                sizes="(max-width: 640px) 50vw, 300px"
                className="object-cover"
              />
              {/* Only ever four tiles; the rest are counted, not cropped. */}
              {i === 3 && post.mediaUrls.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-lg font-semibold">
                  +{post.mediaUrls.length - 4}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <footer className="flex items-center gap-4 mt-3 pt-3 border-t border-[color:var(--color-border)]">
        <button
          type="button"
          onClick={() => like.mutate()}
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? "Unlike" : "Like"}
          className="inline-flex items-center gap-1.5 min-h-11 text-sm text-[color:var(--color-muted)]"
        >
          <Heart
            className={
              "w-4 h-4 " +
              (post.likedByMe ? "fill-red-500 text-red-500" : "")
            }
          />
          {post.likeCount > 0 && post.likeCount}
        </button>
        <button
          type="button"
          onClick={() => setShowComment((v) => !v)}
          aria-expanded={showComment}
          className="inline-flex items-center gap-1.5 min-h-11 text-sm text-[color:var(--color-muted)]"
        >
          <MessageCircle className="w-4 h-4" />
          {post.commentCount > 0 && post.commentCount}
        </button>
      </footer>

      {showComment && (
        <div className="mt-2 flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            className="flex-1 px-3 py-2.5 border border-[color:var(--color-border)] rounded-lg text-base sm:text-sm bg-white"
          />
          <button
            type="button"
            onClick={() =>
              comment.trim() && addComment.mutate({ content: comment.trim() })
            }
            disabled={!comment.trim() || addComment.isPending}
            className="px-4 min-h-11 rounded-lg bg-[color:var(--color-brand)] text-white text-sm font-medium disabled:opacity-40"
          >
            {addComment.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Post"
            )}
          </button>
        </div>
      )}
    </article>
  );
}

/** Shown on the children page when a family has no posts yet. */
export function EmptyFeedHint() {
  return (
    <div className="warm-card text-center py-6">
      <Camera className="w-6 h-6 mx-auto text-[color:var(--color-muted)] mb-2" />
      <p className="text-sm text-[color:var(--color-muted)]">
        Photos and updates from your child&apos;s service will appear here.
      </p>
    </div>
  );
}
