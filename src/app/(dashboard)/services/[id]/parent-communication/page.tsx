"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Megaphone, MessageCircle, Bell, Users, Pencil, Trash2 } from "lucide-react";
import { useParentPosts, useDeleteParentPost, type ParentPost } from "@/hooks/useParentPosts";
import { CreateParentPostForm } from "@/components/services/CreateParentPostForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useSession } from "next-auth/react";

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
