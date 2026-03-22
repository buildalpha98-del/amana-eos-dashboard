"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Link2, CheckCircle2, ExternalLink } from "lucide-react";
import {
  useSocialAccounts,
  useFetchSocialPosts,
  useLinkSocialPost,
} from "@/hooks/useMarketing";
import type { SocialPostData } from "@/hooks/useMarketing";

interface LinkSocialPostModalProps {
  postId: string;
  platform: string;
  onClose: () => void;
}

export function LinkSocialPostModal({
  postId,
  platform,
  onClose,
}: LinkSocialPostModalProps) {
  const [tab, setTab] = useState<"browse" | "manual">("browse");
  const [manualPostId, setManualPostId] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [linked, setLinked] = useState(false);

  const { data: accounts, isLoading: loadingAccounts } = useSocialAccounts();
  const linkPost = useLinkSocialPost();

  // Find the matching connection for this platform
  const matchingAccount = accounts?.find(
    (a) => a.platform === platform && a.status === "connected"
  );
  const connectionId = matchingAccount?.id;

  const { data: socialPosts, isLoading: loadingPosts } =
    useFetchSocialPosts(connectionId);

  function handleLinkPost(externalPostId: string, externalUrl: string) {
    linkPost.mutate(
      { postId, externalPostId, externalUrl },
      {
        onSuccess: () => setLinked(true),
      }
    );
  }

  function handleManualLink() {
    if (!manualPostId.trim()) return;
    handleLinkPost(manualPostId.trim(), manualUrl.trim());
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncate(str: string, len: number): string {
    if (str.length <= len) return str;
    return str.slice(0, len) + "...";
  }

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-2xl rounded-xl bg-card shadow-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-semibold text-foreground">
                Link to Social Post
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Success state */}
          {linked ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-semibold text-foreground mb-1">
                Post Linked Successfully
              </p>
              <p className="text-sm text-muted mb-6">
                Engagement metrics will now sync automatically.
              </p>
              <button
                onClick={onClose}
                className="rounded-lg bg-brand px-6 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Tab Bar */}
              <div className="flex border-b border-border px-6">
                <button
                  onClick={() => setTab("browse")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === "browse"
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  Browse Recent Posts
                </button>
                <button
                  onClick={() => setTab("manual")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === "manual"
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  Manual Entry
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {tab === "browse" ? (
                  <>
                    {loadingAccounts || loadingPosts ? (
                      <p className="text-sm text-muted text-center py-8">
                        Loading social posts...
                      </p>
                    ) : !matchingAccount ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted mb-2">
                          No connected {platform} account found.
                        </p>
                        <p className="text-xs text-muted">
                          Connect your {platform} account first from the Social
                          Connections panel.
                        </p>
                      </div>
                    ) : !socialPosts || socialPosts.length === 0 ? (
                      <p className="text-sm text-muted text-center py-8">
                        No recent posts found on this account.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted">
                              <th className="pb-2 pr-3">Post</th>
                              <th className="pb-2 pr-3">Date</th>
                              <th className="pb-2 pr-3 text-right">Likes</th>
                              <th className="pb-2 pr-3 text-right">
                                Comments
                              </th>
                              <th className="pb-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {socialPosts.map((sp: SocialPostData) => (
                              <tr key={sp.externalId}>
                                <td className="py-2.5 pr-3">
                                  <div className="flex items-center gap-2">
                                    <p className="text-foreground max-w-[200px] truncate">
                                      {truncate(
                                        sp.message || "(no caption)",
                                        60
                                      )}
                                    </p>
                                    {sp.permalink && (
                                      <a
                                        href={sp.permalink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted hover:text-brand"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 pr-3 text-muted whitespace-nowrap">
                                  {formatDate(sp.createdTime)}
                                </td>
                                <td className="py-2.5 pr-3 text-right text-muted">
                                  {sp.likes}
                                </td>
                                <td className="py-2.5 pr-3 text-right text-muted">
                                  {sp.comments}
                                </td>
                                <td className="py-2.5 text-right">
                                  <button
                                    onClick={() =>
                                      handleLinkPost(
                                        sp.externalId,
                                        sp.permalink || ""
                                      )
                                    }
                                    disabled={linkPost.isPending}
                                    className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
                                  >
                                    Link
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                        External Post ID *
                      </label>
                      <input
                        type="text"
                        value={manualPostId}
                        onChange={(e) => setManualPostId(e.target.value)}
                        placeholder="e.g. 123456789012345_987654321098765"
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted uppercase tracking-wider">
                        External URL (optional)
                      </label>
                      <input
                        type="url"
                        value={manualUrl}
                        onChange={(e) => setManualUrl(e.target.value)}
                        placeholder="https://www.facebook.com/..."
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <button
                      onClick={handleManualLink}
                      disabled={!manualPostId.trim() || linkPost.isPending}
                      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
                    >
                      {linkPost.isPending ? "Linking..." : "Link Post"}
                    </button>

                    {linkPost.isError && (
                      <p className="text-xs text-red-600">
                        Failed to link post. Please check the ID and try again.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
