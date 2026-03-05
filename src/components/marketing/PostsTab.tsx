"use client";

import { useState, useCallback } from "react";
import { Plus, Link2 } from "lucide-react";
import { usePosts, useBatchPostAction, useCampaigns } from "@/hooks/useMarketing";
import type { PostData } from "@/hooks/useMarketing";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";
import { CreatePostModal } from "./CreatePostModal";
import { BatchActionBar } from "./BatchActionBar";
import { DuplicateToCentresModal } from "./DuplicateToCentresModal";

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

export function PostsTab({ onSelectPost, serviceId }: PostsTabProps) {
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [showDuplicate, setShowDuplicate] = useState(false);

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

      batchAction.mutate(
        {
          postIds: Array.from(selectedPostIds),
          action,
          ...params,
        },
        {
          onSuccess: () => setSelectedPostIds(new Set()),
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
            setSelectedPostIds(new Set());
            setShowDuplicate(false);
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
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
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
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64]"
        >
          {PLATFORM_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="ml-auto">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#004E64] px-4 py-2 text-sm font-medium text-white hover:bg-[#003d4f] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Post
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            Loading posts...
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            No posts found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedPostIds.size === posts.length && posts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
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
              <tbody className="divide-y divide-gray-100">
                {posts.map((post) => {
                  const hasLiveSync = isRecentSync(post.engagementSyncedAt);
                  const totalEngagement =
                    post.likes + post.comments + post.shares;

                  return (
                    <tr
                      key={post.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td
                        className="px-3 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPostIds.has(post.id)}
                          onChange={() => toggleSelect(post.id)}
                          className="rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
                        />
                      </td>
                      <td
                        className="px-4 py-3 font-medium text-gray-900"
                        onClick={() => onSelectPost(post.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{post.title}</span>
                          {post.externalPostId && (
                            <span aria-label="Linked to social post">
                              <Link2 className="h-3.5 w-3.5 text-[#004E64] shrink-0" />
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
                                className="inline-flex items-center rounded-md bg-[#004E64]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#004E64]"
                              >
                                {s.service.code}
                              </span>
                            ))}
                            {post.services.length > 3 && (
                              <span className="text-[10px] text-gray-400">
                                +{post.services.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">
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
                        <StatusBadge status={post.status} type="post" />
                      </td>
                      <td
                        className="px-4 py-3 text-gray-600"
                        onClick={() => onSelectPost(post.id)}
                      >
                        {formatDate(post.scheduledDate)}
                      </td>
                      <td
                        className="px-4 py-3 text-gray-600"
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
                        className="px-4 py-3 text-gray-600"
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
    </div>
  );
}
