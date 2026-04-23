"use client";

import { useState } from "react";
import {
  Megaphone,
  MessageCircle,
  Bell,
  Users,
  Loader2,
  Heart,
  MessageSquare,
  Send,
} from "lucide-react";
import {
  useParentTimeline,
  useParentPostLikeToggle,
  useParentPostComments,
  useCreateParentPostComment,
  type TimelinePost,
} from "@/hooks/useParentPortal";
import { Avatar, PullSheet, SectionLabel } from "@/components/parent/ui";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, typeof Megaphone> = {
  observation: MessageCircle,
  announcement: Megaphone,
  reminder: Bell,
};

const typeBadge: Record<string, string> = {
  observation: "bg-blue-50 text-blue-600",
  announcement: "bg-amber-50 text-amber-600",
  reminder: "bg-purple-50 text-purple-600",
};

export function TimelineWidget() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useParentTimeline();
  const posts = data?.pages.flatMap((page) => page.items) ?? [];
  const [commentPostId, setCommentPostId] = useState<string | null>(null);

  if (posts.length === 0) return null;

  return (
    <section aria-label="Centre updates">
      <SectionLabel label="Centre Updates" />
      <div className="space-y-3">
        {posts.map((post) => (
          <TimelineCard
            key={post.id}
            post={post}
            onOpenComments={() => setCommentPostId(post.id)}
          />
        ))}
      </div>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 w-full py-2.5 text-sm font-medium text-[color:var(--color-brand)] bg-[color:var(--color-cream-soft)] rounded-[var(--radius-md)] border border-[color:var(--color-border)] hover:bg-[color:var(--color-brand-soft)] transition-colors flex items-center justify-center gap-2"
        >
          {isFetchingNextPage ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </>
          ) : (
            "Load more updates"
          )}
        </button>
      )}

      <CommentSheet
        postId={commentPostId}
        onClose={() => setCommentPostId(null)}
      />
    </section>
  );
}

function TimelineCard({
  post,
  onOpenComments,
}: {
  post: TimelinePost;
  onOpenComments: () => void;
}) {
  const likeToggle = useParentPostLikeToggle();
  const TypeIcon = typeIcons[post.type] ?? MessageCircle;
  const badgeClass = typeBadge[post.type] ?? "bg-gray-50 text-gray-600";
  const dateStr = new Date(post.createdAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleLike = () => {
    likeToggle.mutate({ postId: post.id, liked: post.likedByMe });
  };

  return (
    <article className="warm-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0">
          <TypeIcon className="w-5 h-5 text-[color:var(--color-brand)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-heading font-semibold text-[color:var(--color-foreground)] truncate">
              {post.title}
            </h3>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass}`}
            >
              {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
            </span>
            {post.isCommunity && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 flex items-center gap-0.5">
                <Users className="w-2.5 h-2.5" />
                All
              </span>
            )}
          </div>
          <p className="text-sm text-[color:var(--color-foreground)]/80 mt-1 whitespace-pre-wrap">
            {post.content}
          </p>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {post.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-[10px] bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] px-1.5 py-0.5 rounded-full"
                >
                  {tag.child.firstName}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[color:var(--color-muted)]">
            <span>{post.author?.name ?? "Centre"}</span>
            <span>·</span>
            <time dateTime={post.createdAt}>{dateStr}</time>
          </div>

          {/* Engagement bar */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[color:var(--color-border)]">
            <button
              type="button"
              onClick={handleLike}
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium transition-colors min-h-[36px]",
                post.likedByMe
                  ? "text-[color:var(--color-status-alert-fg)]"
                  : "text-[color:var(--color-muted)] hover:text-[color:var(--color-status-alert-fg)]",
              )}
              aria-pressed={post.likedByMe}
              aria-label={post.likedByMe ? "Unlike" : "Like"}
            >
              <Heart
                className={cn("w-4 h-4", post.likedByMe && "fill-current")}
              />
              {post.likeCount > 0 && <span>{post.likeCount}</span>}
            </button>
            <button
              type="button"
              onClick={onOpenComments}
              className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-brand)] transition-colors min-h-[36px]"
              aria-label="Open comments"
            >
              <MessageSquare className="w-4 h-4" />
              {post.commentCount > 0 ? (
                <span>{post.commentCount}</span>
              ) : (
                <span>Comment</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Comment thread sheet ────────────────────────────────

function CommentSheet({
  postId,
  onClose,
}: {
  postId: string | null;
  onClose: () => void;
}) {
  const open = !!postId;
  const { data, isLoading } = useParentPostComments(postId);
  const create = useCreateParentPostComment(postId ?? "");
  const [body, setBody] = useState("");

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync(trimmed);
      setBody("");
    } catch {
      // onError toast handled by the hook
    }
  };

  return (
    <PullSheet open={open} onOpenChange={(v) => !v && onClose()}>
      <div className="flex flex-col h-full">
        <header className="mb-3">
          <h2 className="text-lg font-heading font-bold">Comments</h2>
        </header>

        {isLoading ? (
          <p className="text-sm text-[color:var(--color-muted)] text-center py-6">
            Loading…
          </p>
        ) : (data?.items ?? []).length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)] text-center py-6">
            No comments yet — be the first to reply.
          </p>
        ) : (
          <ul className="space-y-3 flex-1 overflow-y-auto">
            {[...(data?.items ?? [])].reverse().map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <Avatar name={c.authorName} size="sm" seed={c.id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">
                      {c.authorName}
                    </span>
                    {c.authorType === "staff" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] font-semibold">
                        Staff
                      </span>
                    )}
                    <span className="text-[11px] text-[color:var(--color-muted)]">
                      {new Date(c.createdAt).toLocaleString("en-AU", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-[color:var(--color-foreground)]/90 mt-0.5 whitespace-pre-wrap">
                    {c.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="shrink-0 mt-3 flex items-end gap-2 pt-2 border-t border-[color:var(--color-border)]"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say something kind…"
            rows={1}
            className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border-2 border-[color:var(--color-border)] bg-white text-sm focus:outline-none focus:border-[color:var(--color-brand)] resize-none max-h-32 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={!body.trim() || create.isPending}
            className={cn(
              "shrink-0 rounded-full p-2.5 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center",
              body.trim()
                ? "bg-[color:var(--color-brand)] text-white"
                : "bg-[color:var(--color-border)] text-[color:var(--color-muted)]",
            )}
            aria-label="Post comment"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </PullSheet>
  );
}
