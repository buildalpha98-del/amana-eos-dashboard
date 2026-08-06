"use client";

/**
 * Observations that haven't led anywhere yet.
 *
 * The linking feature is the easy half. OWNA has it too, and it's
 * under-used there because it depends on an educator remembering a menu
 * item exists and going to find the original post. This is the half that
 * makes it happen: the system says which observations are still open.
 *
 * Stays completely silent when there's nothing to say — a card that
 * reads "0 observations need follow-up" is noise on every other day of
 * the year.
 */

import { useQuery } from "@tanstack/react-query";
import { CornerDownRight, Sprout } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import type { ParentPost } from "@/hooks/useParentPosts";

interface NeedsFollowUpRow {
  id: string;
  title: string;
  createdAt: string;
  daysAgo: number;
  mtopOutcomes: string[];
  children: string[];
}

export function NeedsFollowUpCard({
  serviceId,
  posts,
  onFollowUp,
}: {
  serviceId: string;
  /** The loaded feed, so the button can open the composer with the real post. */
  posts: ParentPost[];
  onFollowUp: (post: ParentPost) => void;
}) {
  const { data } = useQuery<{ posts: NeedsFollowUpRow[] }>({
    queryKey: ["service", serviceId, "needs-follow-up"],
    queryFn: () =>
      fetchApi(`/api/services/${serviceId}/parent-posts/needs-follow-up`),
    retry: 1,
  });

  const rows = data?.posts ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-brand/25 bg-brand/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sprout className="h-4 w-4 text-brand" />
        Observations waiting on a follow-up
      </p>
      <p className="mt-0.5 text-xs text-muted">
        What you did about what you noticed is the half an assessor asks
        for — and the half that&apos;s easy to forget.
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          // Only offer the button when the post is in the loaded feed;
          // otherwise it would open an empty composer.
          const loaded = posts.find((p) => p.id === r.id);
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="min-w-0">
                <span className="truncate font-medium text-foreground">
                  {r.title}
                </span>
                <span className="block text-xs text-muted">
                  {r.daysAgo} days ago
                  {r.children.length > 0 && ` · ${r.children.join(", ")}`}
                </span>
              </span>
              {loaded && (
                <button
                  type="button"
                  onClick={() => onFollowUp(loaded)}
                  className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-surface"
                >
                  <CornerDownRight className="h-3.5 w-3.5" />
                  Follow up
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
