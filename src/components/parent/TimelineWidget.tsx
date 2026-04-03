"use client";

import { Megaphone, MessageCircle, Bell, Users, Loader2 } from "lucide-react";
import { useParentTimeline, type TimelinePost } from "@/hooks/useParentPortal";

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
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useParentTimeline();
  const posts = data?.pages.flatMap((page) => page.items) ?? [];

  if (posts.length === 0) return null;

  return (
    <section aria-label="Centre updates">
      <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
        Centre Updates
      </h2>
      <div className="space-y-3">
        {posts.map((post) => (
          <TimelineCard key={post.id} post={post} />
        ))}
      </div>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 w-full py-2.5 text-sm font-medium text-[#004E64] bg-white rounded-xl border border-[#e8e4df] hover:bg-[#004E64]/5 transition-colors flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          {isFetchingNextPage ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Load more updates"
          )}
        </button>
      )}
    </section>
  );
}

function TimelineCard({ post }: { post: TimelinePost }) {
  const TypeIcon = typeIcons[post.type] ?? MessageCircle;
  const badgeClass = typeBadge[post.type] ?? "bg-gray-50 text-gray-600";
  const dateStr = new Date(post.createdAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#004E64]/10 flex items-center justify-center shrink-0">
          <TypeIcon className="w-4 h-4 text-[#004E64]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[#1a1a2e] truncate">
              {post.title}
            </h3>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
              {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
            </span>
            {post.isCommunity && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 flex items-center gap-0.5">
                <Users className="w-2.5 h-2.5" />
                All
              </span>
            )}
          </div>
          <p className="text-sm text-[#7c7c8a] mt-1 line-clamp-3 whitespace-pre-wrap">
            {post.content}
          </p>
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {post.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-[10px] bg-[#004E64]/5 text-[#004E64] px-1.5 py-0.5 rounded-full"
                >
                  {tag.child.firstName}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[#7c7c8a]">
            <span>{post.author?.name ?? "Centre"}</span>
            <span>&middot;</span>
            <time dateTime={post.createdAt}>{dateStr}</time>
          </div>
        </div>
      </div>
    </article>
  );
}
