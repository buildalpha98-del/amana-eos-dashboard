import {
  LayoutDashboard,
  Eye,
  Mountain,
  CheckSquare,
  AlertCircle,
  BarChart3,
  Users,
  Settings,
  Presentation,
  Building2,
  FolderKanban,
  DollarSign,
  Trophy,
  FileText,
  MessageSquare,
  MessageCircle,
  ScrollText,
  Megaphone,
  Radio,
  GraduationCap,
  ShieldCheck,
  ClipboardList,
  CalendarDays,
  FileSignature,
  UserCircle,
  UserPlus,
  Package,
  Target,
  Repeat,
  Palmtree,
  Calculator,
  FolderLock,
  FileSpreadsheet,
  Bot,
  Wrench,
  Briefcase,
  BookOpen,
  BookOpenCheck,
  HelpCircle,
  Rocket,
  Contact,
  Crown,
  Inbox,
  AlertTriangle,
  Shield,
  Activity,
  CalendarCheck,
  Receipt,
  Bug,
  Mail,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { canAccessPage, hasFeature, type Feature } from "@/lib/role-permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  tooltip?: string;
  /**
   * Optional feature gate. When set, the nav item is only shown in the sidebar
   * if the role has this feature (in addition to `canAccessPage`).
   */
  feature?: Feature;
  /**
   * Optional role allowlist. When set, only users with a role in this list
   * will see the item in the sidebar. When omitted, the item is visible to
   * all roles that pass `canAccessPage`. This is a sidebar-visibility control
   * only — it does not restrict URL access (use role-permissions for that).
   */
  roles?: Role[];
}

// ── Role allowlists ───────────────────────────────────────
// Explicit sets used to keep the nav declarations readable.
// Owner is NOT included in these because owner bypasses the roles
// filter entirely in filterNavItems() — owners see all items.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LEADERSHIP_ROLES: Role[] = ["head_office", "admin"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const OPERATIONAL_ROLES: Role[] = ["head_office", "admin", "coordinator", "member", "staff"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MARKETING_ACCESS: Role[] = ["marketing"];
const ALL_NON_MARKETING: Role[] = ["head_office", "admin", "coordinator", "member", "staff"];

/**
 * Single source of truth for the app's navigation items.
 * Consumed by Sidebar (full nav), CommandPalette (quick-nav), and TopBar (page titles).
 */
export const navItems: NavItem[] = [
  // ── Home — personal hub ───────────────────────────────────
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Home", tooltip: "Your command centre overview" },
  { href: "/my-portal", label: "My Portal", icon: UserCircle, section: "Home", tooltip: "Your personal HR hub — profile, leave, training & more" },
  { href: "/queue", label: "My Queue", icon: Inbox, section: "Home", tooltip: "Reports and tasks assigned to you from automation" },
  { href: "/getting-started", label: "Getting Started", icon: Rocket, section: "Home", tooltip: "Your onboarding checklist — get up to speed quickly" },

  // ── EOS — pure EOS methodology ────────────────────────────
  { href: "/vision", label: "Vision / V-TO", icon: Eye, section: "EOS", tooltip: "Vision/Traction Organiser — your long-term goals & strategic plan", roles: ALL_NON_MARKETING },
  { href: "/rocks", label: "Rocks", icon: Mountain, section: "EOS", tooltip: "Quarterly priorities — 90-day goals for the team", roles: ALL_NON_MARKETING },
  { href: "/scorecard", label: "Scorecard", icon: BarChart3, section: "EOS", tooltip: "Weekly measurables & KPIs" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, section: "EOS", tooltip: "7-day action items from weekly meetings", roles: ALL_NON_MARKETING },
  { href: "/issues", label: "Issues", icon: AlertCircle, section: "EOS", tooltip: "Issues List — track & solve using IDS (Identify, Discuss, Solve)", roles: ALL_NON_MARKETING },
  { href: "/meetings", label: "Meetings", icon: Presentation, section: "EOS", tooltip: "Weekly L10 meetings", roles: ALL_NON_MARKETING },

  // ── Operations — day-to-day running ───────────────────────
  { href: "/services", label: "Services", icon: Building2, section: "Operations", roles: ALL_NON_MARKETING },
  { href: "/roll-call", label: "Roll Call", icon: ClipboardList, section: "Operations", tooltip: "Daily attendance sign-in and sign-out", roles: ALL_NON_MARKETING },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck, section: "Operations", tooltip: "Review and action casual booking requests from parents", roles: ALL_NON_MARKETING },
  { href: "/financials", label: "Financials", icon: DollarSign, section: "Operations", roles: ALL_NON_MARKETING },
  { href: "/billing", label: "Billing", icon: Receipt, section: "Operations", tooltip: "Generate statements and record payments for families", roles: ALL_NON_MARKETING },
  { href: "/performance", label: "Performance", icon: Trophy, section: "Operations", roles: ALL_NON_MARKETING },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, section: "Operations", roles: ALL_NON_MARKETING },
  { href: "/compliance/templates", label: "Audit Templates", icon: ClipboardList, section: "Operations", tooltip: "Manage audit template items & upload .docx checklists", roles: ALL_NON_MARKETING },
  { href: "/policies", label: "Policies", icon: Shield, section: "Operations", tooltip: "Policy management & compliance", roles: ALL_NON_MARKETING },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle, section: "Operations", tooltip: "Safety incident tracking", roles: ALL_NON_MARKETING },
  { href: "/holiday-quest", label: "Holiday Quest", icon: Palmtree, section: "Operations", tooltip: "Vacation care day planner & promo generator" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, section: "Operations", tooltip: "Ask questions about your policies, procedures and documents" },

  // ── Growth — pipeline, parents & outreach ─────────────────
  { href: "/messaging", label: "Messages", icon: MessageSquare, section: "Growth", tooltip: "Send and receive messages with families", roles: ALL_NON_MARKETING },
  { href: "/contact-centre", label: "Contact Centre", icon: Inbox, section: "Growth", tooltip: "Enquiries, support tickets, and VAPI call logs in one place", roles: ALL_NON_MARKETING },
  { href: "/enrolments", label: "Enrolments", icon: ClipboardList, section: "Growth", tooltip: "Review and process parent enrolment submissions", roles: ALL_NON_MARKETING },
  { href: "/children", label: "Children", icon: Users, section: "Growth", tooltip: "Browse all enrolled children across services", roles: ALL_NON_MARKETING },
  { href: "/crm", label: "CRM", icon: Target, section: "Growth", tooltip: "Sales pipeline & lead management", roles: ALL_NON_MARKETING },
  { href: "/marketing", label: "Marketing", icon: Megaphone, section: "Growth" },
  { href: "/centre-avatars", label: "Centre Avatars", icon: UserCircle, section: "Growth", tooltip: "Family profile of each centre \u2014 who we serve, what they want", roles: ["marketing", "head_office", "admin"] },
  { href: "/marketing/vendor-briefs", label: "Vendor & Printing", icon: Package, section: "Growth", tooltip: "Brief Jinan, track SLAs, prep for next term", roles: ["marketing"] },
  { href: "/marketing/activations", label: "Activations", icon: CalendarCheck, section: "Growth", tooltip: "Mark activations delivered to trigger recap drafts", roles: ["marketing"] },
  { href: "/marketing/newsletter-chase", label: "Newsletter Chase", icon: Mail, section: "Growth", tooltip: "Pre-drafted newsletter chase emails (last 1–2 weeks of term)", roles: ["marketing"] },
  { href: "/communication", label: "Communication", icon: Radio, section: "Growth" },
  { href: "/communication/whatsapp-compliance", label: "WhatsApp Compliance", icon: MessageCircle, section: "Growth", tooltip: "Daily 5-min check-in: coordinator + network group posts.", roles: ["marketing"] },
  { href: "/conversions", label: "Conversions", icon: Repeat, section: "Growth", tooltip: "Track casual-to-regular booking conversions", roles: ALL_NON_MARKETING },
  { href: "/projects", label: "Projects", icon: FolderKanban, section: "Growth" },

  // ── People — HR & workforce ───────────────────────────────
  { href: "/team", label: "Team", icon: Users, section: "People", roles: ALL_NON_MARKETING },
  { href: "/recruitment", label: "Recruitment", icon: Briefcase, section: "People", tooltip: "Track vacancies, candidates & staff referrals", roles: ALL_NON_MARKETING },
  { href: "/onboarding", label: "Staff Lifecycle", icon: GraduationCap, section: "People", tooltip: "Onboarding, LMS & offboarding", roles: ALL_NON_MARKETING },
  { href: "/contracts", label: "Contracts", icon: FileSignature, section: "People", tooltip: "Employment contracts & award rates", feature: "contracts.view", roles: ALL_NON_MARKETING },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, section: "People", tooltip: "Import OWNA rosters, approve & export to Xero", roles: ALL_NON_MARKETING },
  { href: "/leave", label: "Leave", icon: CalendarDays, section: "People", tooltip: "Request & manage staff leave" },
  { href: "/directory", label: "Staff Directory", icon: Contact, section: "People", tooltip: "Find and connect with your team" },

  // ── Admin — config, strategy & utilities ──────────────────
  { href: "/leadership", label: "Leadership", icon: Crown, section: "Admin", tooltip: "Org-wide KPIs, rocks rollup, coordinator leaderboard, and pulse sentiment", roles: ALL_NON_MARKETING },
  { href: "/reports", label: "Reports", icon: BarChart3, section: "Operations", tooltip: "Attendance, booking, revenue, enrolment, and medical reports", roles: ALL_NON_MARKETING },
  { href: "/settings", label: "Settings", icon: Settings, section: "Admin" },
  { href: "/documents", label: "Documents", icon: FileText, section: "Admin" },
  { href: "/scenarios", label: "Scenarios", icon: Calculator, section: "Admin", tooltip: "What-if scenario modelling & financial projections", roles: ALL_NON_MARKETING },
  { href: "/data-room", label: "Data Room", icon: FolderLock, section: "Admin", tooltip: "Due diligence document tracker & exit readiness scoring", roles: ALL_NON_MARKETING },
  { href: "/reports/board", label: "Board Reports", icon: FileSpreadsheet, section: "Admin", tooltip: "Monthly board & investor report generator", roles: ALL_NON_MARKETING },
  { href: "/assistant", label: "AI Assistant", icon: Bot, section: "Admin", tooltip: "Ask questions about your dashboard data" },
  { href: "/guides", label: "Quick-Start Guides", icon: BookOpenCheck, section: "Admin", tooltip: "Printable role-specific quick-start guides" },
  { href: "/help", label: "Help Centre", icon: HelpCircle, section: "Admin", tooltip: "FAQ and knowledge base — find answers to common questions" },
  { href: "/automations", label: "Automations", icon: Activity, section: "Admin", tooltip: "Monitor the health and cadence of all automated tasks", roles: ALL_NON_MARKETING },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText, section: "Admin", tooltip: "Security audit trail — who did what and when", roles: ALL_NON_MARKETING },
  { href: "/admin/feedback", label: "Feedback Inbox", icon: Bug, section: "Admin", tooltip: "Triage staff-submitted bug reports, feature requests, and questions", roles: ALL_NON_MARKETING },
  { href: "/admin/ai-drafts", label: "AI Drafts", icon: Bot, section: "Admin", tooltip: "Review and bulk-triage all AI-generated task drafts across the organisation", roles: ALL_NON_MARKETING },
  { href: "/tools/ccs-calculator", label: "CCS Calculator", icon: Wrench, section: "Admin", tooltip: "Child Care Subsidy cost estimator", roles: ALL_NON_MARKETING },
  { href: "/tools/the-amana-way", label: "The Amana Way", icon: BookOpenCheck, section: "Admin", tooltip: "Interactive educator induction handbook" },
  { href: "/tools/amana-way-one-pager", label: "Amana Way One Pager", icon: FileText, section: "Admin", tooltip: "The Amana Way at a glance — printable one-pager" },
  { href: "/tools/employee-handbook", label: "Employee Handbook", icon: BookOpen, section: "Admin", tooltip: "Full employee induction handbook with policies and procedures" },
];

/**
 * Derive page title map from navItems for TopBar usage.
 * Additional entries (like /crm/templates) can be spread in by the consumer.
 */
export const pageTitlesFromNav: Record<string, string> = Object.fromEntries(
  navItems.map((item) => [item.href, item.label])
);

/**
 * Filter nav items by role: must pass `canAccessPage` AND (if tagged) the
 * `hasFeature` gate AND (if tagged) the `roles` allowlist. Keeps role logic
 * in one place so Sidebar stays declarative.
 *
 * Feature-gated items are hidden from the sidebar even if the role technically
 * has URL access — acts as a belt-and-suspenders visibility control.
 *
 * `owner` always bypasses the `roles` allowlist (owners see every item they
 * can access by page/feature). The `roles` field is sidebar-visibility only —
 * URL-level access is still governed by `canAccessPage`.
 */
export function filterNavItems(
  items: readonly NavItem[],
  role: Role | undefined
): NavItem[] {
  return items.filter((item) => {
    if (!canAccessPage(role, item.href)) return false;
    if (item.feature && !hasFeature(role, item.feature)) return false;
    if (item.roles && role && role !== "owner" && !item.roles.includes(role)) {
      return false;
    }
    return true;
  });
}
