"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Plus,
  Megaphone,
  MessageCircle,
  Bell,
  Users,
  Pencil,
  Trash2,
  Heart,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import {
  useParentPosts,
  useDeleteParentPost,
  useStaffPostComments,
  useStaffReplyToPost,
  useDeleteStaffPostComment,
  type ParentPost,
} from "@/hooks/useParentPosts";
import { CreateParentPostForm } from "@/components/services/CreateParentPostForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, typeof Megaphone> = {
  observation: MessageCircle,
  announcement: Megaphone,
  reminder: Bell,
};

const typeLabels: Record<string, string> = {
  observation: "Observation",
  announcement: "Announcement",
  reminder: "Reminder",
};

const typeBadgeColors: Record<string, string> = {
  observation: "bg-blue-100 text-blue-700",
  announcement: "bg-amber-100 text-amber-700",
  reminder: "bg-purple-100 text-purple-700",
};

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

export default function ParentCommunicationPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { data, isLoading, error } = useParentPosts(id);
  const deletePost = useDeleteParentPost(id);

  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState<ParentPost | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  if (error) return <ErrorState error={error} />;

  const posts = data?.items ?? [];
  const userId = session?.user?.id;
  const userRole = (session?.user as { role?: string })?.role ?? "";

  function canModify(post: ParentPost) {
    return ORG_WIDE_ROLES.has(userRole) || post.authorId === userId;
  }

  return (
    <div>
      <PageHeader
        title="Parent Communication"
        description="Create posts and announcements visible to parents in the portal"
        primaryAction={{
          label: "Create Post",
          icon: Plus,
          onClick: () => setShowCreate(true),
        }}
      />

      {isLoading ? (
        <div className="space-y-4 mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No posts yet"
          description="Create your first post to share observations, announcements, or reminders with parents."
          action={{
            label: "Create Post",
            icon: Plus,
            onClick: () => setShowCreate(true),
          }}
        />
      ) : (
        <div className="mt-6 space-y-4">
          {posts.map((post) => {
            const TypeIcon = typeIcons[post.type] ?? MessageCircle;
            const editable = canModify(post);
            return (
              <article
                key={post.id}
                className="bg-card border border-border rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeIcon className="w-4 h-4 text-muted shrink-0" />
                    <h3 className="font-semibold text-foreground">{post.title}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadgeColors[post.type] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {typeLabels[post.type] ?? post.type}
                    </span>
                    {post.isCommunity && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Community
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="xs"
                        variant="ghost"
                        iconLeft={<Pencil className="w-3.5 h-3.5" />}
                        onClick={() => setEditingPost(post)}
                        aria-label="Edit post"
                      />
                      <Button
                        size="xs"
                        variant="ghost"
                        iconLeft={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                        onClick={() => setDeletingPostId(post.id)}
                        aria-label="Delete post"
                      />
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted whitespace-pre-wrap">{post.content}</p>

                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="text-xs bg-surface px-2 py-0.5 rounded-full text-foreground/70"
                      >
                        {tag.child.firstName} {tag.child.surname}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted pt-1">
                  <span>{post.author?.name ?? "System"}</span>
                  <span>&middot;</span>
                  <time dateTime={post.createdAt}>
                    {new Date(post.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>

                {/* Engagement bar */}
                <div className="flex items-center gap-4 pt-3 border-t border-border">
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <Heart className="w-4 h-4" />
                    {post.likeCount ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPostId(expandedPostId === post.id ? null : post.id)
                    }
                    className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>
                      {post.commentCount ?? 0}{" "}
                      {(post.commentCount ?? 0) === 1 ? "comment" : "comments"}
                    </span>
                    {expandedPostId === post.id ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Inline comment thread */}
                {expandedPostId === post.id && (
                  <CommentThread serviceId={id} postId={post.id} />
                )}
              </article>
            );
          })}
        </div>
      )}

      <CreateParentPostForm
        serviceId={id}
        open={showCreate || !!editingPost}
        onClose={() => { setShowCreate(false); setEditingPost(null); }}
        editingPost={editingPost}
      />

      <ConfirmDialog
        open={!!deletingPostId}
        onOpenChange={(open) => !open && setDeletingPostId(null)}
        title="Delete Post"
        description="This post will be permanently removed and will no longer appear in the parent portal. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deletePost.isPending}
        onConfirm={() => {
          if (deletingPostId) {
            deletePost.mutate(deletingPostId, {
              onSuccess: () => setDeletingPostId(null),
            });
          }
        }}
      />
    </div>
  );
}

// ─── Staff comment thread ────────────────────────────────

function CommentThread({ serviceId, postId }: { serviceId: string; postId: string }) {
  const { data, isLoading } = useStaffPostComments(serviceId, postId);
  const reply = useStaffReplyToPost(serviceId, postId);
  const del = useDeleteStaffPostComment(serviceId, postId);
  const [body, setBody] = useState("");

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await reply.mutateAsync(trimmed);
      setBody("");
    } catch {
      // toast from hook
    }
  };

  const items = [...(data?.items ?? [])].reverse(); // oldest first

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {isLoading ? (
        <p className="text-xs text-muted">Loading comments…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 text-sm group"
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
                  c.authorType === "staff" ? "bg-brand" : "bg-accent",
                )}
              >
                {c.authorName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold">{c.authorName}</span>
                  {c.authorType === "staff" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand/10 text-brand font-semibold">
                      Staff
                    </span>
                  )}
                  <span className="text-[11px] text-muted">
                    {new Date(c.createdAt).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Remove this comment?")) {
                        del.mutate(c.id);
                      }
                    }}
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-red-600 hover:text-red-700"
                    aria-label="Remove comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
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
        className="flex items-end gap-2"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Reply as centre…"
          rows={1}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand resize-none max-h-32 min-h-[40px]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!body.trim() || reply.isPending}
          iconLeft={<Send className="w-3.5 h-3.5" />}
        >
          Reply
        </Button>
      </form>
    </div>
  );
}
