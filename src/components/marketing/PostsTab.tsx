"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Link2 } from "lucide-react";
import { usePosts, useBatchPostAction, useCampaigns } from "@/hooks/useMarketing";
import type { PostData } from "@/hooks/useMarketing";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";
import { CreatePostModal } from "./CreatePostModal";
import { BatchActionBar } from "./BatchActionBar";
import { DuplicateToCentresModal } from "./DuplicateToCentresModal";
import { toast } from "@/hooks/useToast";
import ImportTemplateModal from "@/components/email/ImportTemplateModal";

interface PostsTabProps {
  onSelectPost: (id: string) => void;
  serviceId?: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

const PLATFORM_OPTIONS = [
  { value: "", label: "All Platforms" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "email", label: "Email" },
  { value: "newsletter", label: "Newsletter" },
  { value: "website", label: "Website" },
  { value: "flyer", label: "Flyer" },
];

function isRecentSync(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs < 24 * 60 * 60 * 1000; // less than 24 hours
}

const PAGE_SIZE = 25;

export function PostsTab({ onSelectPost, serviceId }: PostsTabProps) {
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [page, setPage] = useState(0);
  const router = useRouter();

  const { data: posts, isLoading } = usePosts({
    status: status || undefined,
    platform: platform || undefined,
    serviceId: serviceId || undefined,
  });
  const { data: campaigns } = useCampaigns({});
  const batchAction = useBatchPostAction();

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "\u2014";
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!posts) return;
    setSelectedPostIds((prev) =>
      prev.size === posts.length ? new Set() : new Set(posts.map((p) => p.id))
    );
  }, [posts]);

  const handleBatchAction = useCallback(
    async (action: string, params?: Record<string, unknown>) => {
      if (selectedPostIds.size === 0) return;

      if (action === "duplicate_to_centres") {
        setShowDuplicate(true);
        return;
      }

      const count = selectedPostIds.size;
      batchAction.mutate(
        {
          postIds: Array.from(selectedPostIds),
          action,
          ...params,
        },
        {
          onSuccess: () => {
            setSelectedPostIds(new Set());
            const labels: Record<string, string> = {
              change_status: "Status updated",
              assign_campaign: "Campaign assigned",
              reschedule: "Posts rescheduled",
              delete: "Posts deleted",
            };
            toast({
              description: `${labels[action] ?? "Action completed"} for ${count} post${count !== 1 ? "s" : ""}.`,
            });
          },
        }
      );
    },
    [selectedPostIds, batchAction]
  );

  const handleDuplicate = useCallback(
    (serviceIds: string[]) => {
      batchAction.mutate(
        {
          postIds: Array.from(selectedPostIds),
          action: "duplicate_to_centres",
          serviceIds,
        },
        {
          onSuccess: () => {
            const count = selectedPostIds.size;
            setSelectedPostIds(new Set());
            setShowDuplicate(false);
            toast({
              description: `Duplicated ${count} post${count !== 1 ? "s" : ""} to ${serviceIds.length} centre${serviceIds.length !== 1 ? "s" : ""}.`,
            });
          },
        }
      );
    },
    [selectedPostIds, batchAction]
  );

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {PLATFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Post
          </button>
          <button
            onClick={() => router.push("/marketing/email/compose")}
            className="flex items-center gap-2 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5 transition-colors"
          >
            + New Email
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-surface transition-colors"
          >
            Import Template
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted">
            Loading posts...
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted">
            No posts found
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50 text-left text-xs font-medium uppercase tracking-wider text-muted">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedPostIds.size === posts.length && posts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border text-brand focus:ring-brand"
                    />
                  </th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Centres</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {posts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((post) => {
                  const hasLiveSync = isRecentSync(post.engagementSyncedAt);
                  const totalEngagement =
                    post.likes + post.comments + post.shares;

                  return (
                    <tr
                      key={post.id}
                      className="cursor-pointer hover:bg-surface transition-colors"
                    >
                      <td
                        className="px-3 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPostIds.has(post.id)}
                          onChange={() => toggleSelect(post.id)}
                          className="rounded border-border text-brand focus:ring-brand"
                        />
                      </td>
                      <td
                        className="px-4 py-3 font-medium text-foreground"
                        onClick={() => onSelectPost(post.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{post.title}</span>
                          {post.externalPostId && (
                            <span aria-label="Linked to social post">
                              <Link2 className="h-3.5 w-3.5 text-brand shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={() => onSelectPost(post.id)}
                      >
                        {post.services && post.services.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {post.services.slice(0, 3).map((s) => (
                              <span
                                key={s.service.id}
                                className="inline-flex items-center rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand"
                              >
                                {s.service.code}
                              </span>
                            ))}
                            {post.services.length > 3 && (
                              <span className="text-[10px] text-muted">
                                +{post.services.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted italic">
                            All Centres
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={() => onSelectPost(post.id)}
                      >
                        <PlatformBadge platform={post.platform} />
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={() => onSelectPost(post.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={post.status} type="post" />
                          {post.status === "in_review" && (
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-muted"
                        onClick={() => onSelectPost(post.id)}
                      >
                        {formatDate(post.scheduledDate)}
                      </td>
                      <td
                        className="px-4 py-3 text-muted"
                        onClick={() => onSelectPost(post.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{post.assignee?.name ?? "Unassigned"}</span>
                          {totalEngagement > 0 && hasLiveSync && (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-green-500"
                              aria-label={`Live engagement: ${totalEngagement} total`}
                            />
                          )}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-muted"
                        onClick={() => onSelectPost(post.id)}
                      >
                        {post.campaign?.name ?? "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {posts.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface/50">
              <span className="text-xs text-muted">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, posts.length)} of {posts.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-xs font-medium rounded border border-border bg-card text-muted hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= posts.length}
                  className="px-3 py-1 text-xs font-medium rounded border border-border bg-card text-muted hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Batch Action Bar */}
      {selectedPostIds.size > 0 && (
        <BatchActionBar
          selectedCount={selectedPostIds.size}
          campaigns={campaigns ?? []}
          onAction={handleBatchAction}
          onClear={() => setSelectedPostIds(new Set())}
        />
      )}

      {/* Duplicate to Centres Modal */}
      {showDuplicate && (
        <DuplicateToCentresModal
          postIds={Array.from(selectedPostIds)}
          onDuplicate={handleDuplicate}
          onClose={() => setShowDuplicate(false)}
          isLoading={batchAction.isPending}
        />
      )}

      {/* Create Post Modal */}
      <CreatePostModal open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Import Template Modal */}
      <ImportTemplateModal open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
