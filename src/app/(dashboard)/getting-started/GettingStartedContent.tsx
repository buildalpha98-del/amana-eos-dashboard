"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Sparkles,
  UserCircle,
  CalendarDays,
  ShieldCheck,
  GraduationCap,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

type RoleKey =
  | "staff"
  | "member"
  | "coordinator"
  | "admin"
  | "head_office"
  | "owner"
  | "marketing";

// ---------------------------------------------------------------------------
// Checklist definitions by role
// ---------------------------------------------------------------------------

const CHECKLISTS: Record<RoleKey, ChecklistItem[]> = {
  staff: [
    {
      key: "staff_profile",
      title: "Complete your profile",
      description:
        "Add your photo, qualifications, and emergency contact details.",
      href: "/my-portal",
      icon: UserCircle,
    },
    {
      key: "staff_shifts",
      title: "View your upcoming shifts",
      description: "Check when and where you're rostered on this week.",
      href: "/my-portal",
      icon: CalendarDays,
    },
    {
      key: "staff_compliance",
      title: "Check your compliance certificates",
      description:
        "Make sure your Working With Children Check and First Aid are up to date.",
      href: "/my-portal",
      icon: ShieldCheck,
    },
    {
      key: "staff_training",
      title: "Browse training courses",
      description:
        "Explore available professional development and training modules.",
      href: "/my-portal",
      icon: GraduationCap,
    },
    {
      key: "staff_leave",
      title: "Submit a leave request",
      description: "Know how to request time off when you need it.",
      href: "/leave",
      icon: CalendarOff,
    },
    {
      key: "staff_handbook",
      title: "Read the Amana Way handbook",
      description:
        "Learn about our values, processes, and what makes Amana special.",
      href: "/tools/the-amana-way",
      icon: BookOpen,
    },
  ],

  member: [
    {
      key: "member_dashboard",
      title: "Review your dashboard",
      description: "Get a snapshot of how your centre is tracking.",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      key: "member_compliance",
      title: "Check your centre's compliance",
      description:
        "Review staff qualifications, ratios, and regulatory requirements.",
      href: "/compliance",
      icon: ShieldCheck,
    },
    {
      key: "member_rocks",
      title: "View your Rocks (quarterly goals)",
      description: "See the 90-day priorities that matter most this quarter.",
      href: "/rocks",
      icon: Target,
    },
    {
      key: "member_todos",
      title: "Review weekly To-Dos",
      description: "Check off your action items for the week.",
      href: "/todos",
      icon: ListTodo,
    },
    {
      key: "member_enquiries",
      title: "Manage enquiries",
      description:
        "Follow up on new family enquiries and convert them to enrolments.",
      href: "/enquiries",
      icon: Inbox,
    },
    {
      key: "member_handbook",
      title: "Read the Amana Way handbook",
      description:
        "Refresh yourself on our values, processes, and culture guides.",
      href: "/tools/the-amana-way",
      icon: BookOpen,
    },
  ],

  coordinator: [
    {
      key: "coord_dashboard",
      title: "Review your dashboard",
      description: "See an overview of your centres and key metrics.",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      key: "coord_compliance",
      title: "Check centre compliance",
      description:
        "Ensure all centres meet staffing ratios and regulatory standards.",
      href: "/compliance",
      icon: ShieldCheck,
    },
    {
      key: "coord_rocks",
      title: "View Rocks & To-Dos",
      description:
        "Track quarterly priorities and weekly actions across your centres.",
      href: "/rocks",
      icon: Target,
    },
    {
      key: "coord_leave",
      title: "Manage leave requests",
      description: "Review and approve team leave applications.",
      href: "/leave",
      icon: CalendarOff,
    },
    {
      key: "coord_timesheets",
      title: "View timesheets",
      description: "Review and approve staff timesheets for payroll.",
      href: "/timesheets",
      icon: Clock,
    },
    {
      key: "coord_handbook",
      title: "Read the Amana Way handbook",
      description:
        "Align with the team on processes, culture, and expectations.",
      href: "/tools/the-amana-way",
      icon: BookOpen,
    },
  ],

  admin: [
    {
      key: "admin_dashboard",
      title: "Explore the Command Centre",
      description: "Your high-level view of the entire organisation.",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      key: "admin_scorecard",
      title: "Set up your Scorecard",
      description:
        "Define the weekly measurables that keep everyone accountable.",
      href: "/scorecard",
      icon: TrendingUp,
    },
    {
      key: "admin_rocks",
      title: "Create your first Rock",
      description: "Set a 90-day priority to drive the business forward.",
      href: "/rocks",
      icon: Target,
    },
    {
      key: "admin_team",
      title: "Configure team & roles",
      description: "Invite team members and assign the right access levels.",
      href: "/team",
      icon: Users,
    },
    {
      key: "admin_compliance",
      title: "Review compliance across centres",
      description:
        "Ensure every centre meets staffing and regulatory requirements.",
      href: "/compliance",
      icon: ClipboardCheck,
    },
    {
      key: "admin_settings",
      title: "Set up integrations",
      description:
        "Connect external tools and configure API keys for automation.",
      href: "/settings",
      icon: Settings,
    },
    {
      key: "admin_reports",
      title: "Explore reports",
      description: "Dive into board reports, financials, and trend analysis.",
      href: "/reports/board",
      icon: BarChart3,
    },
  ],

  marketing: [
    {
      key: "mkt_dashboard",
      title: "View the marketing dashboard",
      description: "See campaign performance, social metrics, and content plans.",
      href: "/marketing",
      icon: Megaphone,
    },
    {
      key: "mkt_crm",
      title: "Explore the CRM pipeline",
      description: "Track leads from first contact through to enrolment.",
      href: "/crm",
      icon: TrendingUp,
    },
    {
      key: "mkt_enquiries",
      title: "Check enquiries",
      description: "Review and respond to new family enquiries.",
      href: "/enquiries",
      icon: Inbox,
    },
    {
      key: "mkt_communication",
      title: "Plan communication",
      description:
        "Draft newsletters, social posts, and parent communications.",
      href: "/communication",
      icon: Mail,
    },
  ],

  // head_office and owner share the admin checklist
  head_office: [],
  owner: [],
};

// head_office and owner inherit admin items
CHECKLISTS.head_office = CHECKLISTS.admin;
CHECKLISTS.owner = CHECKLISTS.admin;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getChecklist(role: string): ChecklistItem[] {
  return CHECKLISTS[role as RoleKey] ?? CHECKLISTS.staff;
}

function getProgressMessage(pct: number): string {
  if (pct === 0) return "Let's get you set up — check off each item as you go!";
  if (pct < 40) return "Great start! Keep going, you're building momentum.";
  if (pct < 75) return "You're making great progress! Nearly there.";
  if (pct < 100) return "Almost done! Just a few more to go.";
  return "You're all set! Welcome aboard.";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GettingStartedContent() {
  const { data: sessionData } = useSession();
  const queryClient = useQueryClient();

  const role = (sessionData?.user?.role ?? "staff") as string;
  const firstName =
    sessionData?.user?.name?.split(" ")[0] ?? "there";

  const checklist = getChecklist(role);

  // ── Fetch progress ──────────────────────────────────────────
  const { data, isLoading } = useQuery<{ progress: Record<string, boolean> }>({
    queryKey: ["getting-started"],
    queryFn: async () => {
      const res = await fetch("/api/getting-started");
      if (!res.ok) throw new Error("Failed to load progress");
      return res.json();
    },
  });

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
      const prev = queryClient.getQueryData<{ progress: Record<string, boolean> }>(["getting-started"]);
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
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* Welcome header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-6 h-6 text-brand" />
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome to Amana EOS, {firstName}!
          </h1>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          {getProgressMessage(pct)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Your progress
          </span>
          <span className="text-sm font-semibold text-brand">
            {completedCount}/{totalCount} complete
          </span>
        </div>
        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
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
            All done — you're officially set up!
          </p>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse"
              >
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-gray-200 rounded" />
                    <div className="h-3 w-2/3 bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            ))
          : checklist.map((item) => {
              const done = !!progress[item.key];
              const Icon = item.icon;
              return (
                <div
                  key={item.key}
                  className={cn(
                    "group bg-white rounded-xl border border-gray-200 p-4 transition-all duration-200",
                    done && "bg-gray-50/60 border-gray-100",
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      type="button"
                      aria-label={done ? "Mark incomplete" : "Mark complete"}
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
                        <Circle className="w-6 h-6 text-gray-300 group-hover:text-brand transition-colors duration-200" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={item.href}
                        className={cn(
                          "text-sm font-medium transition-colors duration-200",
                          done
                            ? "text-gray-400 line-through"
                            : "text-gray-900 hover:text-brand",
                        )}
                      >
                        {item.title}
                      </Link>
                      <p
                        className={cn(
                          "text-xs mt-0.5 transition-colors duration-200",
                          done ? "text-gray-300" : "text-gray-500",
                        )}
                      >
                        {item.description}
                      </p>
                    </div>

                    {/* Icon */}
                    <Icon
                      className={cn(
                        "w-5 h-5 flex-shrink-0 mt-0.5 transition-colors duration-200",
                        done ? "text-gray-200" : "text-gray-400",
                      )}
                    />
                  </div>
                </div>
              );
            })}
      </div>

      {/* Need help card */}
      <div className="mt-10 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Need help?</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Browse our Knowledge Base or let us know if something isn't
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Report an Issue
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
