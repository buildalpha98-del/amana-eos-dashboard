"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  UserCircle,
  CalendarDays,
  ShieldCheck,
  CalendarOff,
  BookOpen,
  LayoutDashboard,
  Target,
  ListTodo,
  Users,
  Settings,
  BarChart3,
  Megaphone,
  Mail,
  HelpCircle,
  AlertCircle,
  Clock,
  ClipboardCheck,
  TrendingUp,
  Inbox,
  ChevronDown,
  ChevronRight,
  Bell,
  FileText,
  PieChart,
  Building2,
  Eye,
  DollarSign,
  Briefcase,
  UserPlus,
  Layers,
  Send,
  LineChart,
  ArrowDownUp,
  Globe,
  Folder,
  Lightbulb,
  Activity,
  Map,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { TeamOnboardingTracker } from "@/components/getting-started/TeamOnboardingTracker";
import { WelcomeTour, TOUR_STORAGE_KEY } from "@/components/onboarding/WelcomeTour";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import type { OrgSettingsConfig } from "@/lib/org-settings-shared";
import {
  CHECKLISTS,
  type ChecklistItem,
  type RoleKey,
} from "@/lib/getting-started-checklists";

// ---------------------------------------------------------------------------
// Role display names
// ---------------------------------------------------------------------------

const ROLE_DISPLAY_NAMES: Record<RoleKey, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing Coordinator",
  // 2026-04-30: coordinator merged into member.
  // 2026-05-06: "Director of Service" → "OSHC Educator".
  // 2026-06-02: member → "OSHC Coordinator"; staff → "OSHC Educator".
  member: "OSHC Coordinator",
  staff: "OSHC Educator",
};

// ---------------------------------------------------------------------------
// Checklist definitions by role (12–15 items each, categorised)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChecklist(role: string): ChecklistItem[] {
  return CHECKLISTS[role as RoleKey] ?? CHECKLISTS.staff;
}

function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role as RoleKey] ?? "Team Member";
}

function getProgressMessage(pct: number): string {
  if (pct === 0) return "Let's get you set up — check off each item as you go!";
  if (pct < 40) return "Great start! Keep going, you're building momentum.";
  if (pct < 75) return "You're making great progress! Nearly there.";
  if (pct < 100) return "Almost done! Just a few more to go.";
  return "You're all set! Welcome aboard.";
}

/** Group items by category, preserving insertion order. */
function groupByCategory(
  items: ChecklistItem[],
): { category: string; items: ChecklistItem[] }[] {
  const categories: string[] = [];
  const byCategory: Record<string, ChecklistItem[]> = {};
  for (const item of items) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = [];
      categories.push(item.category);
    }
    byCategory[item.category].push(item);
  }
  return categories.map((category) => ({
    category,
    items: byCategory[category],
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GettingStartedContent() {
  const { data: sessionData } = useSession();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"my-setup" | "team-progress">(
    "my-setup",
  );
  const [showTour, setShowTour] = useState(false);

  const handleReplayTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    setShowTour(true);
  }, []);

  const role = (sessionData?.user?.role ?? "staff") as string;
  const firstName = sessionData?.user?.name?.split(" ")[0] ?? "there";
  const roleDisplayName = getRoleDisplayName(role);
  const isAdmin = isAdminRole(role);

  const baseChecklist = getChecklist(role);

  // 2026-05-16: apply admin-editable title/description overrides on top of
  // the hardcoded items. href/icon/category stay code-driven for safety
  // (admin shouldn't be able to redirect items to non-existent routes).
  // Fetched via the same /api/org-settings/config endpoint that powers
  // role labels and role-guide welcome messages.
  const { data: orgConfig } = useQuery<{ config: OrgSettingsConfig }>({
    queryKey: ["org-settings-config"],
    queryFn: async () => {
      const res = await fetch("/api/org-settings/config");
      if (!res.ok) throw new Error("Failed to load org settings");
      return res.json();
    },
    staleTime: 60_000,
  });
  const overrides =
    orgConfig?.config?.checklistOverrides?.[
      role as keyof OrgSettingsConfig["checklistOverrides"]
    ] ?? {};
  const checklist: ChecklistItem[] = baseChecklist.map((item) => {
    const o = overrides[item.key];
    if (!o) return item;
    return {
      ...item,
      title: typeof o.title === "string" && o.title.length > 0 ? o.title : item.title,
      description:
        typeof o.description === "string" && o.description.length > 0
          ? o.description
          : item.description,
    };
  });
  const grouped = groupByCategory(checklist);

  // ── Collapsed state per category ───────────────────────────
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  // ── Fetch progress ──────────────────────────────────────────
  const { data, isLoading } = useQuery<{
    progress: Record<string, boolean>;
  }>({
    queryKey: ["getting-started"],
    queryFn: async () => {
      const res = await fetch("/api/getting-started");
      if (!res.ok) throw new Error("Failed to load progress");
      return res.json();
    },
  });

  // ── Fetch role video URLs ─────────────────────────────────
  const { data: videoData } = useQuery<{
    roleVideos: Record<string, string>;
  }>({
    queryKey: ["getting-started-videos"],
    queryFn: async () => {
      const res = await fetch("/api/getting-started/videos");
      if (!res.ok) throw new Error("Failed to load videos");
      return res.json();
    },
  });

  const roleVideoUrl = videoData?.roleVideos?.[role as RoleKey] ?? "";

  const progress = data?.progress ?? {};

  // ── Toggle mutation ─────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({
      key,
      completed,
    }: {
      key: string;
      completed: boolean;
    }) => {
      const res = await fetch("/api/getting-started", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, completed }),
      });
      if (!res.ok) throw new Error("Failed to update progress");
      return res.json();
    },
    onMutate: async ({ key, completed }) => {
      await queryClient.cancelQueries({ queryKey: ["getting-started"] });
      const prev = queryClient.getQueryData<{
        progress: Record<string, boolean>;
      }>(["getting-started"]);
      queryClient.setQueryData(["getting-started"], {
        progress: { ...prev?.progress, [key]: completed },
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["getting-started"], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["getting-started"] });
    },
  });

  // ── Computed stats ──────────────────────────────────────────
  const completedCount = checklist.filter((i) => progress[i.key]).length;
  const totalCount = checklist.length;
  const pct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* Welcome header */}
      <PageHeader
        title={`Welcome to Amana EOS, ${firstName}!`}
        description={getProgressMessage(pct)}
        badge={roleDisplayName}
        secondaryActions={[
          {
            label: "Replay Tour",
            icon: PlayCircle,
            onClick: handleReplayTour,
          },
        ]}
      />

      {/* Welcome tour replay */}
      {showTour && (
        <WelcomeTour
          onComplete={() => {
            localStorage.setItem(TOUR_STORAGE_KEY, "true");
            setShowTour(false);
          }}
        />
      )}

      {/* Tab toggle for admins */}
      {isAdmin && (
        <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("my-setup")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "my-setup"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            My Setup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("team-progress")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "team-progress"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            Team Progress
          </button>
        </div>
      )}

      {activeTab === "team-progress" && isAdmin ? (
        <TeamOnboardingTracker />
      ) : (
        <>
          {/* Progress bar */}
          <div className="bg-card rounded-xl border border-border p-5 mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground/80">
                Your progress
              </span>
              <span className="text-sm font-semibold text-brand">
                {completedCount}/{totalCount} complete
              </span>
            </div>
            <div className="h-3 w-full bg-surface rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  pct === 100 ? "bg-emerald-500" : "bg-brand",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct === 100 && (
              <p className="text-xs text-emerald-600 mt-2 font-medium">
                All done — you&apos;re officially set up!
              </p>
            )}
          </div>

          {/* Video walkthrough */}
          {roleVideoUrl ? (
            <div className="bg-card rounded-xl border border-border p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <PlayCircle className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-semibold text-foreground">Watch the walkthrough</h3>
                <span className="text-xs text-muted">2-5 min</span>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden bg-surface">
                <iframe
                  src={roleVideoUrl}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                />
              </div>
            </div>
          ) : (
            <div className="bg-surface/50 rounded-xl border border-dashed border-border p-4 mb-6 flex items-center gap-3">
              <PlayCircle className="w-5 h-5 text-muted/50" />
              <p className="text-xs text-muted">Video walkthrough coming soon — check back after rollout!</p>
            </div>
          )}

          {/* Categorised checklist */}
          {isLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, gi) => (
                <div key={gi}>
                  <div className="h-5 w-40 bg-border rounded animate-pulse mb-3" />
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-card rounded-xl border border-border p-4 animate-pulse"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-6 h-6 rounded-full bg-border" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-1/3 bg-border rounded" />
                            <div className="h-3 w-2/3 bg-surface rounded" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => {
                const catCompleted = group.items.filter(
                  (i) => progress[i.key],
                ).length;
                const catTotal = group.items.length;
                const catDone = catCompleted === catTotal;
                const isCollapsed = !!collapsed[group.category];

                return (
                  <div key={group.category}>
                    {/* Category header */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(group.category)}
                      className="flex items-center gap-2 w-full mb-3 group/cat focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md px-1 -mx-1"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted" />
                      )}
                      <h2
                        className={cn(
                          "text-sm font-semibold",
                          catDone ? "text-emerald-600" : "text-foreground/80",
                        )}
                      >
                        {group.category}
                      </h2>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          catDone
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                            : "bg-surface text-muted",
                        )}
                      >
                        {catCompleted}/{catTotal}
                      </span>
                    </button>

                    {/* Items */}
                    {!isCollapsed && (
                      <div className="space-y-3">
                        {group.items.map((item) => {
                          const done = !!progress[item.key];
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.key}
                              className={cn(
                                "group bg-card rounded-xl border border-border p-4 transition-all duration-200",
                                done && "bg-surface/50/60 border-border/50",
                              )}
                            >
                              <div className="flex items-start gap-4">
                                {/* Checkbox */}
                                <button
                                  type="button"
                                  aria-label={
                                    done ? "Mark incomplete" : "Mark complete"
                                  }
                                  onClick={() =>
                                    toggleMutation.mutate({
                                      key: item.key,
                                      completed: !done,
                                    })
                                  }
                                  className="mt-0.5 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full"
                                >
                                  {done ? (
                                    <CheckCircle2 className="w-6 h-6 text-emerald-500 transition-transform duration-200 scale-110" />
                                  ) : (
                                    <Circle className="w-6 h-6 text-muted/50 group-hover:text-brand transition-colors duration-200" />
                                  )}
                                </button>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <Link
                                    href={item.href}
                                    className={cn(
                                      "text-sm font-medium transition-colors duration-200",
                                      done
                                        ? "text-muted line-through"
                                        : "text-foreground hover:text-brand",
                                    )}
                                  >
                                    {item.title}
                                  </Link>
                                  <p
                                    className={cn(
                                      "text-xs mt-0.5 transition-colors duration-200",
                                      done ? "text-muted/50" : "text-muted",
                                    )}
                                  >
                                    {item.description}
                                  </p>
                                </div>

                                {/* Icon */}
                                <Icon
                                  className={cn(
                                    "w-5 h-5 flex-shrink-0 mt-0.5 transition-colors duration-200",
                                    done ? "text-muted/50" : "text-muted",
                                  )}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Need help card */}
          <div className="mt-10 bg-card rounded-xl border border-border p-5">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Need help?
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Browse our Knowledge Base or let us know if something isn&apos;t
                  working.
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  <Link
                    href="/help"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand bg-brand/5 rounded-lg hover:bg-brand/10 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Knowledge Base
                  </Link>
                  <Link
                    href="/tickets"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface rounded-lg hover:bg-border transition-colors"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Report an Issue
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
