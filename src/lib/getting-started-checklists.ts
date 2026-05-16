/**
 * Canonical Getting Started checklist data — per-role item lists shown on
 * /getting-started. Extracted from the consumer page so the settings
 * editor (in /settings/organisation) can render the same item keys, and
 * so admins can override `title` / `description` per item via
 * `OrgSettings.config.checklistOverrides`.
 *
 * `href`, `icon`, and `category` stay code-driven — admin shouldn't be
 * able to redirect items at non-existent routes or arbitrary icons. Only
 * the user-facing text is overridable.
 *
 * 2026-05-17: extracted as part of the checklist editor rollout.
 */

import {
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
  AlertCircle,
  Clock,
  ClipboardCheck,
  TrendingUp,
  Inbox,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: string;
}

export type RoleKey =
  | "staff"
  | "member"
  | "admin"
  | "head_office"
  | "owner"
  | "marketing";

export const CHECKLIST_ROLE_KEYS: RoleKey[] = [
  "staff",
  "member",
  "marketing",
  "admin",
  "head_office",
  "owner",
];

export const CHECKLISTS: Record<RoleKey, ChecklistItem[]> = {
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

  // ── Member / Director of Service (14 items) ────────────────
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
// 2026-05-17: CHECKLISTS extracted from GettingStartedContent.tsx for shared use.
