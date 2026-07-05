"use client";

/**
 * /feedback hub — two tabs (URL-synced via ?tab=parent|internal):
 *   - Parent Feedback: SMS replies + survey responses (the old /feedback)
 *   - Internal Feedback: staff bug reports / feature requests (the old
 *     /admin/feedback, which now redirects here)
 *
 * The Internal tab is only rendered for admin-tier roles (owner,
 * head_office, admin) — the same set that could reach /admin/feedback.
 * The internal-feedback API enforces this server-side too.
 */

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageCircle, Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/role-permissions";
import { Skeleton } from "@/components/ui/Skeleton";
import { ParentFeedbackQueueContent } from "./ParentFeedbackQueueContent";
import { FeedbackInboxContent } from "../admin/feedback/FeedbackInboxContent";

const TABS = [
  { key: "parent", label: "Parent Feedback", icon: MessageCircle, adminOnly: false },
  { key: "internal", label: "Internal Feedback", icon: Bug, adminOnly: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function FeedbackHubInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = isAdminRole(
    (session?.user as { role?: string } | undefined)?.role,
  );

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const tabParam = searchParams.get("tab");
  // Fall back to "parent" for unknown values, or when a non-admin deep-links
  // ?tab=internal. The URL is left untouched so the internal tab activates
  // once the session hydrates and confirms an admin-tier role.
  const activeTab: TabKey =
    tabParam === "internal" && isAdmin ? "internal" : "parent";

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`/feedback?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Tab Bar — only shown when there's more than one tab to pick */}
      {visibleTabs.length > 1 && (
        <div className="border-b border-border mb-6">
          <nav className="flex gap-0 -mb-px" aria-label="Feedback tabs">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setTab(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                    isActive
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-foreground hover:border-border",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {activeTab === "internal" ? (
        <FeedbackInboxContent />
      ) : (
        <ParentFeedbackQueueContent />
      )}
    </div>
  );
}

export function FeedbackHubContent() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <FeedbackHubInner />
    </Suspense>
  );
}
