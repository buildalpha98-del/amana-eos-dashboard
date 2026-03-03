"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { usePosts } from "@/hooks/useMarketing";
import { StatusBadge } from "./StatusBadge";
import { PlatformBadge } from "./PlatformBadge";
import { CreatePostModal } from "./CreatePostModal";

interface PostsTabProps {
  onSelectPost: (id: string) => void;
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

export function PostsTab({ onSelectPost }: PostsTabProps) {
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: posts, isLoading } = usePosts({
    status: status || undefined,
    platform: platform || undefined,
  });

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
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Platform</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Campaign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    onClick={() => onSelectPost(post.id)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {post.title}
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge platform={post.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={post.status} type="post" />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(post.scheduledDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {post.assignee?.name ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {post.campaign?.name ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Post Modal */}
      <CreatePostModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
