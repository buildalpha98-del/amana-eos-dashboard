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

export function ParentFeed({
  childId,
  childFirstName,
  heading,
}: {
  /** Narrow to posts this child is tagged in — "Abdul's moments". */
  childId?: string;
  childFirstName?: string;
  heading?: string;
} = {}) {
  const qc = useQueryClient();
  const label =
    heading ??
    (childFirstName ? `${childFirstName}'s moments` : "Latest from your centre");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<FeedPage>({
      // Keyed by child so the whole-centre feed and a child's moments
      // don't share a cache entry and overwrite each other.
      queryKey: ["parent", "timeline", childId ?? "all"],
      queryFn: ({ pageParam }) =>
        fetchApi(
          `/api/parent/timeline?limit=10` +
            (childId ? `&childId=${encodeURIComponent(childId)}` : "") +
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
        <SectionLabel label={label} />
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
          <Skeleton className="h-40 rounded-[var(--radius-lg)]" />
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    // On Home, stay silent — a new family shouldn't meet a heading over
    // nothing. On a child's page the section was explicitly asked for,
    // so say why it's empty instead of vanishing.
    if (!childId) return null;
    return (
      <section aria-label={label}>
        <SectionLabel label={label} />
        <div className="warm-card text-center py-6">
          <Camera className="w-6 h-6 mx-auto text-[color:var(--color-muted)] mb-2" />
          <p className="text-sm text-[color:var(--color-muted)]">
            {childFirstName
              ? `${childFirstName} hasn't been tagged in a post yet.`
              : "Nothing here yet."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Service updates">
      <SectionLabel label={label} />
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChanged={() =>
              qc.invalidateQueries({ queryKey: ["parent", "timeline"] })
            }
          />
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
  // Long posts collapse. A photo-led feed stops being scannable the
  // moment one newsletter-length update pushes everything else off screen.
  const [expanded, setExpanded] = useState(false);

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

  // Comments are deliberately absent from the parent portal: a photo of
  // one child with a comment thread under it is a conversation other
  // families can read. Likes stay — they're private to the sender.
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
          </p>
        </div>
      </header>

      {post.title && (
        <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] mb-1">
          {post.title}
        </h3>
      )}
      <PostBody
        text={post.content}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
      />

      {/*
        Only this family's children are ever named. The server already
        filters the tag list to their own childIds, so there is nothing
        here to leak — this renders what it was given.
      */}
      {taggedNames.length > 0 && (
        <p className="mt-2 text-xs text-[color:var(--color-brand)] font-medium">
          Featuring: {taggedNames.join(", ")}
        </p>
      )}

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
              {/* A blob that has since been deleted, or one uploaded on a
                  preview deployment (its own store) and read in
                  production, 404s. Show a neutral tile rather than the
                  browser's broken-image icon. */}
              <Image
                src={url}
                alt={post.title || "Post photo"}
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.parentElement?.classList.add("post-photo-missing");
                }}
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
              "w-4 h-4 " + (post.likedByMe ? "fill-red-500 text-red-500" : "")
            }
          />
          {post.likeCount > 0 && post.likeCount}
        </button>
      </footer>
    </article>
  );
}

const COLLAPSE_AT = 280;

/**
 * Post body with a "Read more" fold, and bare URLs turned into links.
 *
 * Auto-linked rather than rendered as rich HTML: staff type into a plain
 * textarea, and the one thing they paste that needs to be clickable is a
 * link. Escaping is not a concern because this builds React elements
 * from split text — nothing is ever passed as HTML.
 */
function PostBody({
  text,
  expanded,
  onExpand,
}: {
  text: string;
  expanded: boolean;
  onExpand: () => void;
}) {
  const long = text.length > COLLAPSE_AT;
  const shown = expanded || !long ? text : text.slice(0, COLLAPSE_AT).trimEnd();

  return (
    <div>
      <p className="text-sm text-[color:var(--color-foreground)]/85 leading-relaxed whitespace-pre-wrap">
        {linkify(shown)}
        {long && !expanded && "…"}
      </p>
      {long && !expanded && (
        <button
          type="button"
          onClick={onExpand}
          className="mt-1 text-sm font-medium text-[color:var(--color-brand)] min-h-11"
        >
          Read more
        </button>
      )}
    </div>
  );
}

// Split with the global form, TEST with a separate non-global one.
// `RegExp.test` on a /g regex advances lastIndex between calls, so
// reusing one here would link every second URL and skip the rest.
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\/[^\s]+$/;

function linkify(text: string): React.ReactNode[] {
  return text.split(URL_SPLIT).map((part, i) =>
    IS_URL.test(part) ? (
      <a
        key={`${part}-${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[color:var(--color-brand)] underline underline-offset-2 break-all"
      >
        {part}
      </a>
    ) : (
      part
    ),
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
