import {
  Sun,
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
  Target,
  Palmtree,
  Calculator,
  FolderLock,
  FileSpreadsheet,
  Bot,
  Wrench,
  Briefcase,
  BookOpen,
  Rocket,
  Contact,
  Crown,
  Inbox,
  Shield,
  Activity,
  CalendarCheck,
  Receipt,
  Mail,
  Network,
  Brain,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { canAccessPage, hasFeature, type Feature } from "@/lib/role-permissions";
import { EOS_ROLES } from "@/lib/role-enum";

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
const OPERATIONAL_ROLES: Role[] = ["head_office", "admin", "member", "staff"];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MARKETING_ACCESS: Role[] = ["marketing"];
const ALL_NON_MARKETING: Role[] = ["head_office", "admin", "member", "staff"];

// 2026-04-30: per training-session feedback, EOS surfaces in the sidebar are
// for State Manager + Admin (owner bypasses). Director of Service (member)
// and Educator (staff) interact with EOS exclusively inside the service
// detail tabs (/services/[id]?tab=eos&sub=...) — having a parallel global
// sidebar entry was confusing because most of the rocks/todos/issues they
// touch are service-scoped.
//
// 2026-06-03: added "marketing" (Akram's role) — the Marketing Coordinator
// participates in weekly L10s, owns todos out of those meetings, and tracks
// quarterly rocks for campaigns. They had Scorecard already; this extends
// the rest of the EOS surface to them.
// 2026-06-23: EOS roles (viewer / implementer) are EOS-only and need the
// EOS sidebar links to actually reach their surface.
const EOS_SIDEBAR_ROLES: Role[] = ["head_office", "admin", "marketing", ...EOS_ROLES];

/**
 * Single source of truth for the app's navigation items.
 * Consumed by Sidebar (full nav), CommandPalette (quick-nav), and TopBar (page titles).
 */
export const navItems: NavItem[] = [
  // ── Home — personal hub ───────────────────────────────────
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Home", tooltip: "Your command centre overview" },
  { href: "/my-portal", label: "My Portal", icon: UserCircle, section: "Home", tooltip: "Your personal HR hub — profile, leave, training & more" },
  { href: "/my-day", label: "My Day", icon: Sun, section: "Home", tooltip: "Clock, roll call, and today's checklists in one place" },
  { href: "/my-training", label: "My Training", icon: GraduationCap, section: "Home", tooltip: "Your induction and ongoing training courses" },
  { href: "/surveys", label: "My Surveys", icon: ClipboardList, section: "Home", tooltip: "Surveys sent to you — feedback, check-ins, culture" },
  { href: "/queue", label: "My Queue", icon: Inbox, section: "Home", tooltip: "Reports and tasks assigned to you from automation" },
  { href: "/getting-started", label: "Getting Started", icon: Rocket, section: "Home", tooltip: "Your onboarding checklist — get up to speed quickly" },

  // ── EOS — pure EOS methodology ────────────────────────────
  // 2026-04-30: tightened from ALL_NON_MARKETING → EOS_SIDEBAR_ROLES.
  // Director of Service (member) and Educator (staff) now see EOS only
  // inside the service detail page; they don't get a sidebar shortcut.
  { href: "/vision", label: "Vision / V-TO", icon: Eye, section: "EOS", tooltip: "Vision/Traction Organiser — your long-term goals & strategic plan", roles: EOS_SIDEBAR_ROLES },
  { href: "/rocks", label: "Rocks", icon: Mountain, section: "EOS", tooltip: "Quarterly priorities — 90-day goals for the team", roles: EOS_SIDEBAR_ROLES },
  // Scorecard is a special case: it lives in the EOS section but is also
  // surfaced in Akram's marketing cockpit (campaign metrics roll up here).
  // Allowed for State Manager, Admin, and Marketing — but NOT Director of
  // Service or Educator. Owner bypasses.
  { href: "/scorecard", label: "Scorecard", icon: BarChart3, section: "EOS", tooltip: "Weekly measurables & KPIs", roles: ["head_office", "admin", "marketing", ...EOS_ROLES] },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, section: "EOS", tooltip: "7-day action items from weekly meetings", roles: EOS_SIDEBAR_ROLES },
  { href: "/issues", label: "Issues", icon: AlertCircle, section: "EOS", tooltip: "Issues List — track & solve using IDS (Identify, Discuss, Solve)", roles: EOS_SIDEBAR_ROLES },
  { href: "/meetings", label: "Meetings", icon: Presentation, section: "EOS", tooltip: "Weekly L10 meetings", roles: EOS_SIDEBAR_ROLES },
  // Visible to ALL roles (everyone benefits from seeing org structure).
  { href: "/accountability-chart", label: "Accountability Chart", icon: Network, section: "EOS", tooltip: "Who's accountable for what — the org structure" },

  // ── Operations — day-to-day running ───────────────────────
  { href: "/services", label: "Services", icon: Building2, section: "Operations", roles: ALL_NON_MARKETING },
  // /roll-call top-level removed 2026-04-29 — lives inside /services/[id]?tab=daily-ops&sub=roll-call.
  // Coordinators / staff drill into their service to access the daily roll call grid.
  { href: "/bookings", label: "Bookings", icon: CalendarCheck, section: "Operations", tooltip: "Review and action casual booking requests from parents", roles: ALL_NON_MARKETING },
  { href: "/financials", label: "Financials", icon: DollarSign, section: "Operations", roles: ALL_NON_MARKETING },
  { href: "/billing", label: "Billing", icon: Receipt, section: "Operations", tooltip: "Generate statements and record payments for families", roles: ALL_NON_MARKETING },
  // 2026-07-05 nav consolidation phase 2: /reports folded in as the
  // "Reports" view; /messaging → Contact Centre tab; /conversions → CRM
  // view; five marketing satellites → /marketing Field Ops / Team Ops
  // tabs (vendor-briefs page kept, linked from Field Ops).
  { href: "/performance", label: "Performance & Reports", icon: Trophy, section: "Operations", tooltip: "Centre health scores plus attendance, booking, revenue, enrolment and medical reports", roles: ALL_NON_MARKETING },
  // 2026-07-05 (nav consolidation phase 1): /compliance/templates and
  // /compliance/registers removed from the sidebar — the /compliance page
  // tab bar now links out to both sub-pages instead.
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, section: "Operations", roles: ALL_NON_MARKETING },
  { href: "/safe-reports", label: "Safe Reports", icon: Shield, section: "Operations", tooltip: "Anonymous staff reports — harassment, safety, conduct. Owner & head office only.", roles: ["owner", "head_office"] },
  { href: "/policies", label: "Policies & Procedures", icon: Shield, section: "Operations", tooltip: "Versioned PDF library with per-version acknowledgement", roles: ALL_NON_MARKETING },
  // 2026-07-05: /incidents removed from the sidebar entirely (was
  // head_office/admin since 2026-04-30). Deprecated in favour of the
  // leadership card + per-service Compliance → Incidents tabs. The page
  // itself stays reachable by URL.
  { href: "/holiday-quest", label: "Holiday Quest", icon: Palmtree, section: "Operations", tooltip: "Vacation care day planner & promo generator" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, section: "Operations", tooltip: "Ask questions about your policies, procedures and documents" },

  // ── Growth — pipeline, parents & outreach ─────────────────
  { href: "/contact-centre", label: "Contact Centre", icon: Inbox, section: "Growth", tooltip: "Enquiries, support tickets, and VAPI call logs in one place", roles: ALL_NON_MARKETING },
  { href: "/enrolments", label: "Enrolments", icon: ClipboardList, section: "Growth", tooltip: "Review and process parent enrolment submissions", roles: ALL_NON_MARKETING },
  { href: "/children", label: "Children", icon: Users, section: "Growth", tooltip: "Browse all enrolled children across services", roles: ALL_NON_MARKETING },
  { href: "/crm", label: "CRM", icon: Target, section: "Growth", tooltip: "Sales pipeline & lead management", roles: ALL_NON_MARKETING },
  { href: "/marketing", label: "Marketing", icon: Megaphone, section: "Marketing" },
  { href: "/centre-avatars", label: "Centre Avatars", icon: UserCircle, section: "Marketing", tooltip: "Family profile of each centre \u2014 who we serve, what they want", roles: ["marketing", "head_office", "admin"] },
  { href: "/communication", label: "Communication", icon: Radio, section: "Growth" },
  { href: "/communication/whatsapp-compliance", label: "WhatsApp Compliance", icon: MessageCircle, section: "Marketing", tooltip: "Daily 5-min check-in: coordinator + network group posts.", roles: ["marketing"] },
  { href: "/projects", label: "Projects", icon: FolderKanban, section: "Growth" },

  // ── People — HR & workforce ───────────────────────────────
  { href: "/team", label: "Team", icon: Users, section: "People", roles: ALL_NON_MARKETING },
  { href: "/recruitment", label: "Recruitment", icon: Briefcase, section: "People", tooltip: "Track vacancies, candidates & staff referrals", roles: ALL_NON_MARKETING },
  { href: "/onboarding", label: "Staff Lifecycle", icon: GraduationCap, section: "People", tooltip: "Onboarding, LMS & offboarding", roles: ALL_NON_MARKETING },
  { href: "/contracts", label: "Contracts", icon: FileSignature, section: "People", tooltip: "Employment contracts & award rates", feature: "contracts.view", roles: ALL_NON_MARKETING },
  { href: "/position-descriptions", label: "Position Descriptions", icon: FileText, section: "People", tooltip: "Per-role job description library" },
  // 2026-07-05 (nav consolidation phase 1): /diversity-dashboard +
  // /wgea-report collapsed into the /workforce-reports hub (tabs).
  { href: "/workforce-reports", label: "Workforce Reports", icon: BarChart3, section: "People", tooltip: "Diversity & inclusion stats and WGEA workforce-composition reporting", roles: ["owner", "head_office", "admin"] },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, section: "People", tooltip: "Import OWNA rosters, approve & export to Xero", roles: ALL_NON_MARKETING },
  // 2026-06-29: `/leave` retired from the sidebar. Every new leave
  // request now goes through My Portal → EH so managers get the
  // pending notification inside Employment Hero and there's a single
  // source of truth. The /leave route still resolves (admins draining
  // pre-existing pending requests can hit the URL directly) but with
  // a banner pointing to My Portal and the "Request Leave" button
  // removed. Delete the route + API entirely once the backlog drains.
  { href: "/leave-payroll", label: "Leave", icon: CalendarDays, section: "People", tooltip: "Live leave data from Employment Hero. Approve in EH.", roles: ["owner", "head_office", "admin"] },
  { href: "/directory", label: "Staff Directory", icon: Contact, section: "People", tooltip: "Find and connect with your team" },

  // ── Admin — config, strategy & utilities ──────────────────
  // 2026-04-30: tightened to admin (the org-admin role, not the state-manager
  // head_office role). Owner bypasses. State Manager (head_office), marketing,
  // member, and staff/educator no longer see the Leadership cockpit. Service
  // Coordinator implicit-kept (user listed 6 roles in target spec without
  // explicitly removing coordinator).
  { href: "/leadership", label: "Leadership", icon: Crown, section: "Admin", tooltip: "Org-wide KPIs, rocks rollup, coordinator leaderboard, and pulse sentiment", roles: ["admin"] },
    // ── Settings — pulled out of Admin 2026-06-29. Admin was 23 items
  // deep; extracting the 5 configuration items into their own section
  // gives users a clear mental model of "where do I change config?"
  // and shrinks Admin closer to a support/tools drawer.
  { href: "/settings", label: "Settings", icon: Settings, section: "Settings" },
  { href: "/settings/organisation", label: "Org Settings", icon: Settings, section: "Settings", tooltip: "Runtime configuration — email sender, ratios, health score weights", roles: ["admin"] },
  { href: "/settings/permissions", label: "Role Permissions", icon: Shield, section: "Settings", tooltip: "Page-by-page access matrix — owner-only edit", roles: ["owner", "admin"] },
  { href: "/settings/ai-knowledge", label: "AI Knowledge", icon: Brain, section: "Settings", tooltip: "Content the AI assistant searches when staff ask questions", roles: ["owner", "head_office", "admin"] },
  { href: "/settings/email-templates", label: "Email Templates", icon: Mail, section: "Settings", tooltip: "Edit subject + body for transactional emails", roles: ["admin"] },
  { href: "/documents", label: "Documents", icon: FileText, section: "Admin" },
  { href: "/scenarios", label: "Scenarios", icon: Calculator, section: "Admin", tooltip: "What-if scenario modelling & financial projections", roles: ALL_NON_MARKETING },
  { href: "/data-room", label: "Data Room", icon: FolderLock, section: "Admin", tooltip: "Due diligence document tracker & exit readiness scoring", roles: ALL_NON_MARKETING },
  { href: "/reports/board", label: "Board Reports", icon: FileSpreadsheet, section: "Admin", tooltip: "Monthly board & investor report generator", roles: ALL_NON_MARKETING },
  { href: "/assistant", label: "AI Assistant", icon: Bot, section: "Admin", tooltip: "Ask questions about your dashboard data" },
  // 2026-07-05 (nav consolidation phase 1): six entries — /guides, /help,
  // /tools/the-amana-way, /tools/handbook, /tools/amana-way-one-pager and
  // /tools/employee-handbook — collapsed into the /handbook hub (tabs).
  // The old routes redirect there, so deep links keep working.
  { href: "/handbook", label: "Handbook & Help", icon: BookOpen, section: "Admin", tooltip: "Handbooks, The Amana Way, quick-start guides and the help centre" },
  { href: "/automations", label: "Automations", icon: Activity, section: "Admin", tooltip: "Monitor the health and cadence of all automated tasks", roles: ALL_NON_MARKETING },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText, section: "Admin", tooltip: "Security audit trail — who did what and when", roles: ALL_NON_MARKETING },
  // 2026-07-05 (nav consolidation phase 1): /admin/feedback merged into
  // /feedback as the "Internal Feedback" tab (admin-tier only).
  { href: "/feedback", label: "Feedback", icon: MessageCircle, section: "Admin", tooltip: "Parent SMS/survey responses and staff-submitted internal feedback", roles: ALL_NON_MARKETING },
  { href: "/admin/ai-drafts", label: "AI Drafts", icon: Bot, section: "Admin", tooltip: "Review and bulk-triage all AI-generated task drafts across the organisation", roles: ALL_NON_MARKETING },
  { href: "/tools/ccs-calculator", label: "CCS Calculator", icon: Wrench, section: "Admin", tooltip: "Child Care Subsidy cost estimator", roles: ALL_NON_MARKETING },
];

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
