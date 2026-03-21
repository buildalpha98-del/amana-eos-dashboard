"use client";

import { useState } from "react";
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
import type { LucideIcon } from "lucide-react";
import { TeamOnboardingTracker } from "@/components/getting-started/TeamOnboardingTracker";

const ADMIN_ROLES = ["owner", "admin", "head_office"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: string;
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
// Role display names
// ---------------------------------------------------------------------------

const ROLE_DISPLAY_NAMES: Record<RoleKey, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing Coordinator",
  coordinator: "Service Coordinator",
  member: "Centre Director",
  staff: "Educator",
};

// ---------------------------------------------------------------------------
// Checklist definitions by role (12–15 items each, categorised)
// ---------------------------------------------------------------------------

const CHECKLISTS: Record<RoleKey, ChecklistItem[]> = {
  // ── Staff / Educator (12 items) ────────────────────────────
  staff: [
    {
      key: "staff_profile",
      title: "Complete your profile",
      description:
        "Add your photo, qualifications, and emergency contact details.",
      href: "/my-portal",
      icon: UserCircle,
      category: "Getting Set Up",
    },
    {
      key: "staff_compliance",
      title: "Upload your compliance certificates",
      description:
        "Ensure your Working With Children Check, First Aid, and other certs are current.",
      href: "/my-portal",
      icon: ShieldCheck,
      category: "Getting Set Up",
    },
    {
      key: "staff_handbook",
      title: "Read The Amana Way",
      description:
        "Learn about our values, processes, and what makes Amana special.",
      href: "/tools/the-amana-way",
      icon: BookOpen,
      category: "Getting Set Up",
    },
    {
      key: "staff_roster",
      title: "Check your roster",
      description: "See when and where you're rostered on this week.",
      href: "/my-portal",
      icon: CalendarDays,
      category: "Daily Tasks",
    },
    {
      key: "staff_checklist",
      title: "View your daily checklist",
      description:
        "Review the opening, mid-session, and closing tasks for your shift.",
      href: "/my-portal",
      icon: ClipboardCheck,
      category: "Daily Tasks",
    },
    {
      key: "staff_attendance",
      title: "Record attendance",
      description:
        "Mark children in and out as they arrive and leave your session.",
      href: "/services",
      icon: Users,
      category: "Daily Tasks",
    },
    {
      key: "staff_incidents",
      title: "Log any incidents",
      description:
        "Report accidents, injuries, or behavioural incidents as they happen.",
      href: "/incidents",
      icon: AlertCircle,
      category: "Daily Tasks",
    },
    {
      key: "staff_todos",
      title: "Review your to-dos",
      description: "Check off your weekly action items and stay on track.",
      href: "/todos",
      icon: ListTodo,
      category: "Weekly Tasks",
    },
    {
      key: "staff_timesheet",
      title: "Submit your timesheet",
      description: "Confirm your hours before the weekly payroll cut-off.",
      href: "/timesheets",
      icon: Clock,
      category: "Weekly Tasks",
    },
    {
      key: "staff_leave",
      title: "Check your leave balance",
      description:
        "Know how much leave you have and submit requests when needed.",
      href: "/leave",
      icon: CalendarOff,
      category: "Weekly Tasks",
    },
    {
      key: "staff_activities",
      title: "Browse the activity library",
      description:
        "Discover program ideas and activities you can run at your centre.",
      href: "/services",
      icon: Lightbulb,
      category: "Stay Connected",
    },
    {
      key: "staff_notifications",
      title: "Check your notifications",
      description:
        "Stay up to date with announcements, assignments, and reminders.",
      href: "/notifications",
      icon: Bell,
      category: "Stay Connected",
    },
  ],

  // ── Member / Centre Director (14 items) ────────────────────
  member: [
    {
      key: "member_dashboard",
      title: "Review your dashboard",
      description: "Get a snapshot of how your centre is tracking today.",
      href: "/dashboard",
      icon: LayoutDashboard,
      category: "Getting Set Up",
    },
    {
      key: "member_compliance",
      title: "Check centre compliance",
      description:
        "Review staff qualifications, ratios, and regulatory requirements.",
      href: "/compliance",
      icon: ShieldCheck,
      category: "Getting Set Up",
    },
    {
      key: "member_services",
      title: "Explore your services overview",
      description:
        "See all sessions, capacity, and key metrics for your centre.",
      href: "/services",
      icon: Building2,
      category: "Getting Set Up",
    },
    {
      key: "member_attendance",
      title: "Review daily attendance",
      description:
        "Check permanent and casual bookings against actual attendance.",
      href: "/services",
      icon: Users,
      category: "Daily Operations",
    },
    {
      key: "member_checklists",
      title: "Check daily checklists",
      description:
        "Ensure opening, mid-session, and closing tasks are completed.",
      href: "/services",
      icon: ClipboardCheck,
      category: "Daily Operations",
    },
    {
      key: "member_enquiries",
      title: "Manage enquiries",
      description:
        "Follow up on new family enquiries and convert them to enrolments.",
      href: "/enquiries",
      icon: Inbox,
      category: "Daily Operations",
    },
    {
      key: "member_incidents",
      title: "Log and review incidents",
      description:
        "Record any incidents and review flagged reports from your team.",
      href: "/incidents",
      icon: AlertCircle,
      category: "Daily Operations",
    },
    {
      key: "member_rocks",
      title: "Update your rocks",
      description: "Track your 90-day priorities and mark milestones.",
      href: "/rocks",
      icon: Target,
      category: "EOS Rhythm",
    },
    {
      key: "member_todos",
      title: "Complete weekly to-dos",
      description: "Check off your action items for the week.",
      href: "/todos",
      icon: ListTodo,
      category: "EOS Rhythm",
    },
    {
      key: "member_scorecard",
      title: "Enter scorecard data",
      description:
        "Update your weekly measurables to keep the team accountable.",
      href: "/scorecard",
      icon: TrendingUp,
      category: "EOS Rhythm",
    },
    {
      key: "member_l10",
      title: "Prepare for your L10 meeting",
      description:
        "Review rocks, scorecard, and issues before your weekly meeting.",
      href: "/meetings",
      icon: CalendarDays,
      category: "EOS Rhythm",
    },
    {
      key: "member_staff_compliance",
      title: "Review staff compliance",
      description:
        "Check that all team members have current certificates and qualifications.",
      href: "/compliance",
      icon: ShieldCheck,
      category: "Team Management",
    },
    {
      key: "member_leave",
      title: "Approve leave requests",
      description:
        "Review and action pending leave applications from your team.",
      href: "/leave",
      icon: CalendarOff,
      category: "Team Management",
    },
    {
      key: "member_handbook",
      title: "Read The Amana Way",
      description:
        "Refresh yourself on our values, processes, and culture guides.",
      href: "/tools/the-amana-way",
      icon: BookOpen,
      category: "Team Management",
    },
  ],

  // ── Coordinator / Service Coordinator (14 items) ───────────
  coordinator: [
    {
      key: "coord_dashboard",
      title: "Review your dashboard overview",
      description:
        "See an overview of your centres and key metrics at a glance.",
      href: "/dashboard",
      icon: LayoutDashboard,
      category: "Getting Set Up",
    },
    {
      key: "coord_compliance",
      title: "Check all centres' compliance",
      description:
        "Ensure every centre meets staffing ratios and regulatory standards.",
      href: "/compliance",
      icon: ShieldCheck,
      category: "Getting Set Up",
    },
    {
      key: "coord_services",
      title: "Explore the services section",
      description:
        "Browse all centres, sessions, and operational data in one place.",
      href: "/services",
      icon: Building2,
      category: "Getting Set Up",
    },
    {
      key: "coord_attendance",
      title: "Monitor attendance across centres",
      description:
        "Compare attendance rates and capacity usage across your centres.",
      href: "/services",
      icon: Users,
      category: "Operations",
    },
    {
      key: "coord_checklists",
      title: "Review checklists",
      description:
        "Check that daily operational checklists are being completed on time.",
      href: "/services",
      icon: ClipboardCheck,
      category: "Operations",
    },
    {
      key: "coord_incidents",
      title: "Manage incidents",
      description:
        "Review incident reports across centres and follow up on flagged items.",
      href: "/incidents",
      icon: AlertCircle,
      category: "Operations",
    },
    {
      key: "coord_policies",
      title: "Check policies",
      description:
        "Ensure centre policies are current and acknowledged by staff.",
      href: "/policies",
      icon: FileText,
      category: "Operations",
    },
    {
      key: "coord_rocks",
      title: "Track rocks across centres",
      description:
        "Monitor quarterly priorities for each centre you oversee.",
      href: "/rocks",
      icon: Target,
      category: "EOS Rhythm",
    },
    {
      key: "coord_todos",
      title: "Manage to-dos",
      description:
        "Review and assign weekly action items across your centres.",
      href: "/todos",
      icon: ListTodo,
      category: "EOS Rhythm",
    },
    {
      key: "coord_scorecard",
      title: "Review scorecard",
      description:
        "Track weekly measurables and spot trends across your centres.",
      href: "/scorecard",
      icon: TrendingUp,
      category: "EOS Rhythm",
    },
    {
      key: "coord_issues",
      title: "Review issues",
      description:
        "Identify, discuss, and solve issues raised across centres.",
      href: "/issues",
      icon: AlertCircle,
      category: "EOS Rhythm",
    },
    {
      key: "coord_leave",
      title: "Approve leave requests",
      description:
        "Review and action pending leave applications from staff.",
      href: "/leave",
      icon: CalendarOff,
      category: "People",
    },
    {
      key: "coord_timesheets",
      title: "Review timesheets",
      description: "Check and approve staff timesheets before payroll.",
      href: "/timesheets",
      icon: Clock,
      category: "People",
    },
    {
      key: "coord_directory",
      title: "Check staff directory",
      description:
        "Browse team members, contact details, and role assignments.",
      href: "/staff-directory",
      icon: Users,
      category: "People",
    },
  ],

  // ── Marketing Coordinator (12 items) ───────────────────────
  marketing: [
    {
      key: "mkt_dashboard",
      title: "Explore the marketing dashboard",
      description:
        "See campaign performance, social metrics, and content plans.",
      href: "/marketing",
      icon: Megaphone,
      category: "Getting Set Up",
    },
    {
      key: "mkt_crm",
      title: "Set up your CRM pipeline",
      description:
        "Configure lead stages and track prospects from first contact.",
      href: "/crm",
      icon: TrendingUp,
      category: "Getting Set Up",
    },
    {
      key: "mkt_enquiry_flow",
      title: "Review the enquiry flow",
      description:
        "Understand how enquiries arrive, get nurtured, and convert.",
      href: "/enquiries",
      icon: ArrowDownUp,
      category: "Getting Set Up",
    },
    {
      key: "mkt_template",
      title: "Create an email template",
      description:
        "Design a branded email template for parent communications.",
      href: "/marketing?tab=toolkit&sub=composer",
      icon: Mail,
      category: "Campaigns",
    },
    {
      key: "mkt_sequence",
      title: "Plan a marketing sequence",
      description:
        "Set up automated nurture sequences to engage new families.",
      href: "/marketing?tab=sequences",
      icon: Send,
      category: "Campaigns",
    },
    {
      key: "mkt_campaigns",
      title: "Review active campaigns",
      description:
        "Check the status and performance of running email campaigns.",
      href: "/marketing?tab=campaigns",
      icon: Megaphone,
      category: "Campaigns",
    },
    {
      key: "mkt_conversions",
      title: "Track conversions",
      description:
        "Monitor the enquiry-to-enrolment conversion funnel.",
      href: "/onboarding",
      icon: TrendingUp,
      category: "Growth",
    },
    {
      key: "mkt_enquiries",
      title: "Manage enquiries",
      description: "Review and respond to new family enquiries promptly.",
      href: "/enquiries",
      icon: Inbox,
      category: "Growth",
    },
    {
      key: "mkt_coverage",
      title: "Monitor centre coverage",
      description:
        "Check vacancy rates and waitlist demand across all centres.",
      href: "/services",
      icon: Globe,
      category: "Growth",
    },
    {
      key: "mkt_analytics",
      title: "Check marketing analytics",
      description:
        "Review email open rates, click-through rates, and send volumes.",
      href: "/marketing?tab=analytics",
      icon: LineChart,
      category: "Reporting",
    },
    {
      key: "mkt_crm_metrics",
      title: "Review CRM metrics",
      description:
        "Analyse lead pipeline health, scoring, and conversion rates.",
      href: "/crm",
      icon: PieChart,
      category: "Reporting",
    },
    {
      key: "mkt_export",
      title: "Export reports",
      description:
        "Download CSVs and reports for external stakeholder updates.",
      href: "/marketing?tab=analytics",
      icon: FileText,
      category: "Reporting",
    },
  ],

  // ── Admin (15 items) ───────────────────────────────────────
  admin: [
    {
      key: "admin_dashboard",
      title: "Explore the command centre",
      description: "Your high-level view of the entire organisation.",
      href: "/dashboard",
      icon: LayoutDashboard,
      category: "Getting Set Up",
    },
    {
      key: "admin_team",
      title: "Invite team members",
      description:
        "Add staff to the dashboard and assign their access levels.",
      href: "/team",
      icon: UserPlus,
      category: "Getting Set Up",
    },
    {
      key: "admin_roles",
      title: "Set up roles and permissions",
      description:
        "Configure who can see and do what across the dashboard.",
      href: "/team",
      icon: Users,
      category: "Getting Set Up",
    },
    {
      key: "admin_integrations",
      title: "Configure integrations",
      description:
        "Connect external tools and set up API keys for automation.",
      href: "/settings",
      icon: Settings,
      category: "Getting Set Up",
    },
    {
      key: "admin_rocks",
      title: "Create your first rock",
      description: "Set a 90-day priority to drive the business forward.",
      href: "/rocks",
      icon: Target,
      category: "EOS Setup",
    },
    {
      key: "admin_scorecard",
      title: "Set up scorecard measurables",
      description:
        "Define the weekly numbers that keep everyone accountable.",
      href: "/scorecard",
      icon: TrendingUp,
      category: "EOS Setup",
    },
    {
      key: "admin_meetings",
      title: "Configure meeting rhythm",
      description:
        "Set up your weekly L10 meetings and quarterly planning sessions.",
      href: "/meetings",
      icon: CalendarDays,
      category: "EOS Setup",
    },
    {
      key: "admin_compliance",
      title: "Review compliance",
      description:
        "Ensure every centre meets staffing and regulatory requirements.",
      href: "/compliance",
      icon: ClipboardCheck,
      category: "Operations",
    },
    {
      key: "admin_policies",
      title: "Set up policies",
      description:
        "Create organisational policies and track staff acknowledgements.",
      href: "/policies",
      icon: FileText,
      category: "Operations",
    },
    {
      key: "admin_audits",
      title: "Configure audit templates",
      description:
        "Set up recurring audit schedules and compliance checks.",
      href: "/services",
      icon: ClipboardCheck,
      category: "Operations",
    },
    {
      key: "admin_board",
      title: "Explore board reports",
      description:
        "Review executive summaries and board-ready reports.",
      href: "/reports/board",
      icon: BarChart3,
      category: "Oversight",
    },
    {
      key: "admin_financials",
      title: "Review financials",
      description:
        "Check revenue, costs, and margin data across centres.",
      href: "/financials",
      icon: DollarSign,
      category: "Oversight",
    },
    {
      key: "admin_performance",
      title: "Check performance dashboards",
      description:
        "Compare centre performance and identify improvement areas.",
      href: "/performance",
      icon: Activity,
      category: "Oversight",
    },
    {
      key: "admin_data_room",
      title: "Browse the data room",
      description:
        "Access shared documents, reports, and organisational files.",
      href: "/data-room",
      icon: Folder,
      category: "Oversight",
    },
    {
      key: "admin_scenarios",
      title: "Explore scenarios",
      description:
        "Model growth scenarios and financial projections.",
      href: "/scenarios",
      icon: Layers,
      category: "Oversight",
    },
  ],

  // ── Head Office / State Manager (14 items) ─────────────────
  head_office: [
    {
      key: "ho_dashboard",
      title: "Review your dashboard",
      description:
        "Get a high-level view of all centres and key organisational metrics.",
      href: "/dashboard",
      icon: LayoutDashboard,
      category: "Getting Set Up",
    },
    {
      key: "ho_centres",
      title: "Check all centres",
      description:
        "Browse every centre's performance, capacity, and health scores.",
      href: "/services",
      icon: Building2,
      category: "Getting Set Up",
    },
    {
      key: "ho_performance",
      title: "Explore performance comparisons",
      description:
        "Compare centres side-by-side on key operational metrics.",
      href: "/performance",
      icon: BarChart3,
      category: "Getting Set Up",
    },
    {
      key: "ho_compliance",
      title: "Monitor compliance",
      description:
        "Review regulatory compliance status across all centres.",
      href: "/compliance",
      icon: ShieldCheck,
      category: "Operations",
    },
    {
      key: "ho_incidents",
      title: "Review incidents",
      description:
        "Track incident trends and follow up on flagged reports.",
      href: "/incidents",
      icon: AlertCircle,
      category: "Operations",
    },
    {
      key: "ho_policies",
      title: "Check policies",
      description:
        "Ensure organisational policies are current and acknowledged.",
      href: "/policies",
      icon: FileText,
      category: "Operations",
    },
    {
      key: "ho_audits",
      title: "Review audit results",
      description:
        "Check completed audits and outstanding action items.",
      href: "/services",
      icon: ClipboardCheck,
      category: "Operations",
    },
    {
      key: "ho_rocks",
      title: "Review rocks",
      description:
        "Track quarterly priorities across the organisation.",
      href: "/rocks",
      icon: Target,
      category: "Strategy",
    },
    {
      key: "ho_scorecard",
      title: "Track scorecard",
      description:
        "Monitor weekly measurables and identify trends.",
      href: "/scorecard",
      icon: TrendingUp,
      category: "Strategy",
    },
    {
      key: "ho_scenarios",
      title: "Explore scenarios",
      description:
        "Model growth projections and strategic what-if analyses.",
      href: "/scenarios",
      icon: Layers,
      category: "Strategy",
    },
    {
      key: "ho_board",
      title: "Check board reports",
      description:
        "Review executive summaries ready for board presentation.",
      href: "/reports/board",
      icon: BarChart3,
      category: "Strategy",
    },
    {
      key: "ho_team",
      title: "Review team structure",
      description:
        "Browse the accountability chart and role assignments.",
      href: "/team",
      icon: Users,
      category: "People",
    },
    {
      key: "ho_recruitment",
      title: "Monitor recruitment",
      description:
        "Check open vacancies, candidate pipelines, and referrals.",
      href: "/recruitment",
      icon: Briefcase,
      category: "People",
    },
    {
      key: "ho_staff_lifecycle",
      title: "Check staff lifecycle",
      description:
        "Review onboarding progress, retention milestones, and exits.",
      href: "/onboarding",
      icon: Activity,
      category: "People",
    },
  ],

  // ── Owner (15 items) ───────────────────────────────────────
  owner: [
    {
      key: "owner_dashboard",
      title: "Review the command centre",
      description:
        "Your executive view of the entire Amana OSHC organisation.",
      href: "/dashboard",
      icon: LayoutDashboard,
      category: "Getting Set Up",
    },
    {
      key: "owner_vto",
      title: "Explore the V/TO",
      description:
        "Review the Vision/Traction Organizer — your company's strategic plan.",
      href: "/vto",
      icon: Eye,
      category: "Getting Set Up",
    },
    {
      key: "owner_accountability",
      title: "Check the accountability chart",
      description: "See who owns what across the organisation.",
      href: "/accountability",
      icon: Map,
      category: "Getting Set Up",
    },
    {
      key: "owner_rocks",
      title: "Set company rocks",
      description:
        "Define the top 90-day priorities for the whole organisation.",
      href: "/rocks",
      icon: Target,
      category: "EOS Rhythm",
    },
    {
      key: "owner_scorecard",
      title: "Configure the scorecard",
      description:
        "Set the weekly measurables that drive business health.",
      href: "/scorecard",
      icon: TrendingUp,
      category: "EOS Rhythm",
    },
    {
      key: "owner_issues",
      title: "Review issues",
      description:
        "Prioritise and solve the most important organisational issues.",
      href: "/issues",
      icon: AlertCircle,
      category: "EOS Rhythm",
    },
    {
      key: "owner_l10",
      title: "Set up L10 meetings",
      description:
        "Configure the weekly Level 10 meeting cadence for your team.",
      href: "/meetings",
      icon: CalendarDays,
      category: "EOS Rhythm",
    },
    {
      key: "owner_scenarios",
      title: "Explore scenarios",
      description:
        "Model growth, expansion, and financial what-if scenarios.",
      href: "/scenarios",
      icon: Layers,
      category: "Strategy",
    },
    {
      key: "owner_board",
      title: "Review board reports",
      description:
        "Access board-ready executive summaries and trend analysis.",
      href: "/reports/board",
      icon: BarChart3,
      category: "Strategy",
    },
    {
      key: "owner_data_room",
      title: "Check the data room",
      description:
        "Browse shared documents, contracts, and organisational records.",
      href: "/data-room",
      icon: Folder,
      category: "Strategy",
    },
    {
      key: "owner_conversions",
      title: "Monitor conversions",
      description:
        "Track the enquiry-to-enrolment pipeline and growth trends.",
      href: "/onboarding",
      icon: TrendingUp,
      category: "Strategy",
    },
    {
      key: "owner_financials",
      title: "Review financials",
      description:
        "Check revenue, costs, margins, and financial health across centres.",
      href: "/financials",
      icon: DollarSign,
      category: "Operations",
    },
    {
      key: "owner_compliance",
      title: "Check compliance",
      description:
        "Ensure every centre meets all regulatory and staffing requirements.",
      href: "/compliance",
      icon: ShieldCheck,
      category: "Operations",
    },
    {
      key: "owner_performance",
      title: "Monitor performance",
      description:
        "Compare centre performance and identify areas for improvement.",
      href: "/performance",
      icon: Activity,
      category: "Operations",
    },
    {
      key: "owner_settings",
      title: "Configure settings",
      description:
        "Manage organisation-wide settings, integrations, and API keys.",
      href: "/settings",
      icon: Settings,
      category: "Admin",
    },
    {
      key: "owner_access",
      title: "Review team access",
      description:
        "Check who has access to what and manage roles and permissions.",
      href: "/team",
      icon: Users,
      category: "Admin",
    },
  ],
};

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

  const role = (sessionData?.user?.role ?? "staff") as string;
  const firstName = sessionData?.user?.name?.split(" ")[0] ?? "there";
  const roleDisplayName = getRoleDisplayName(role);
  const isAdmin = ADMIN_ROLES.includes(role);

  const checklist = getChecklist(role);
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
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-6 h-6 text-brand" />
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome to Amana EOS, {firstName}!
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
            {roleDisplayName}
          </span>
          <p className="text-gray-500 text-sm">{getProgressMessage(pct)}</p>
        </div>
      </div>

      {/* Tab toggle for admins */}
      {isAdmin && (
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("my-setup")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "my-setup"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
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
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
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
                All done — you&apos;re officially set up!
              </p>
            )}
          </div>

          {/* Video walkthrough */}
          {roleVideoUrl ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <PlayCircle className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-semibold text-gray-900">Watch the walkthrough</h3>
                <span className="text-xs text-gray-400">2-5 min</span>
              </div>
              <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                <iframe
                  src={roleVideoUrl}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                />
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4 mb-6 flex items-center gap-3">
              <PlayCircle className="w-5 h-5 text-gray-300" />
              <p className="text-xs text-gray-400">Video walkthrough coming soon — check back after rollout!</p>
            </div>
          )}

          {/* Categorised checklist */}
          {isLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, gi) => (
                <div key={gi}>
                  <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-3" />
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
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
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                      <h2
                        className={cn(
                          "text-sm font-semibold",
                          catDone ? "text-emerald-600" : "text-gray-700",
                        )}
                      >
                        {group.category}
                      </h2>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          catDone
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-100 text-gray-500",
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
                                "group bg-white rounded-xl border border-gray-200 p-4 transition-all duration-200",
                                done && "bg-gray-50/60 border-gray-100",
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
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Need help card */}
          <div className="mt-10 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Need help?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
