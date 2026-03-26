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
  Inbox,
  AlertTriangle,
  Shield,
  Activity,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  tooltip?: string;
}

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
  { href: "/vision", label: "Vision / V-TO", icon: Eye, section: "EOS", tooltip: "Vision/Traction Organiser — your long-term goals & strategic plan" },
  { href: "/rocks", label: "Rocks", icon: Mountain, section: "EOS", tooltip: "Quarterly priorities — 90-day goals for the team" },
  { href: "/scorecard", label: "Scorecard", icon: BarChart3, section: "EOS", tooltip: "Weekly measurables & KPIs" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, section: "EOS", tooltip: "7-day action items from weekly meetings" },
  { href: "/issues", label: "Issues", icon: AlertCircle, section: "EOS", tooltip: "Issues List — track & solve using IDS (Identify, Discuss, Solve)" },
  { href: "/meetings", label: "Meetings", icon: Presentation, section: "EOS", tooltip: "Weekly L10 meetings" },

  // ── Operations — day-to-day running ───────────────────────
  { href: "/services", label: "Services", icon: Building2, section: "Operations" },
  { href: "/financials", label: "Financials", icon: DollarSign, section: "Operations" },
  { href: "/performance", label: "Performance", icon: Trophy, section: "Operations" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, section: "Operations" },
  { href: "/compliance/templates", label: "Audit Templates", icon: ClipboardList, section: "Operations", tooltip: "Manage audit template items & upload .docx checklists" },
  { href: "/policies", label: "Policies", icon: Shield, section: "Operations", tooltip: "Policy management & compliance" },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle, section: "Operations", tooltip: "Safety incident tracking" },
  { href: "/holiday-quest", label: "Holiday Quest", icon: Palmtree, section: "Operations", tooltip: "Vacation care day planner & promo generator" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, section: "Operations", tooltip: "Ask questions about your policies, procedures and documents" },

  // ── Growth — pipeline, parents & outreach ─────────────────
  { href: "/enquiries", label: "Enquiries", icon: UserPlus, section: "Growth", tooltip: "Parent enquiry pipeline — track from first contact to retention" },
  { href: "/enrolments", label: "Enrolments", icon: ClipboardList, section: "Growth", tooltip: "Review and process parent enrolment submissions" },
  { href: "/children", label: "Children", icon: Users, section: "Growth", tooltip: "Browse all enrolled children across services" },
  { href: "/crm", label: "CRM", icon: Target, section: "Growth", tooltip: "Sales pipeline & lead management" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, section: "Growth" },
  { href: "/communication", label: "Communication", icon: Radio, section: "Growth" },
  { href: "/conversions", label: "Conversions", icon: Repeat, section: "Growth", tooltip: "Track casual-to-regular booking conversions" },
  { href: "/projects", label: "Projects", icon: FolderKanban, section: "Growth" },

  // ── People — HR & workforce ───────────────────────────────
  { href: "/team", label: "Team", icon: Users, section: "People" },
  { href: "/recruitment", label: "Recruitment", icon: Briefcase, section: "People", tooltip: "Track vacancies, candidates & staff referrals" },
  { href: "/onboarding", label: "Staff Lifecycle", icon: GraduationCap, section: "People", tooltip: "Onboarding, LMS & offboarding" },
  { href: "/contracts", label: "Contracts", icon: FileSignature, section: "People", tooltip: "Employment contracts & award rates" },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, section: "People", tooltip: "Import OWNA rosters, approve & export to Xero" },
  { href: "/leave", label: "Leave", icon: CalendarDays, section: "People", tooltip: "Request & manage staff leave" },
  { href: "/directory", label: "Staff Directory", icon: Contact, section: "People", tooltip: "Find and connect with your team" },

  // ── Admin — config, strategy & utilities ──────────────────
  { href: "/settings", label: "Settings", icon: Settings, section: "Admin" },
  { href: "/documents", label: "Documents", icon: FileText, section: "Admin" },
  { href: "/scenarios", label: "Scenarios", icon: Calculator, section: "Admin", tooltip: "What-if scenario modelling & financial projections" },
  { href: "/data-room", label: "Data Room", icon: FolderLock, section: "Admin", tooltip: "Due diligence document tracker & exit readiness scoring" },
  { href: "/reports/board", label: "Board Reports", icon: FileSpreadsheet, section: "Admin", tooltip: "Monthly board & investor report generator" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, section: "Admin", tooltip: "Ask questions about your dashboard data" },
  { href: "/tickets", label: "Tickets", icon: MessageSquare, section: "Admin" },
  { href: "/guides", label: "Quick-Start Guides", icon: BookOpenCheck, section: "Admin", tooltip: "Printable role-specific quick-start guides" },
  { href: "/help", label: "Help Centre", icon: HelpCircle, section: "Admin", tooltip: "FAQ and knowledge base — find answers to common questions" },
  { href: "/automations", label: "Automations", icon: Activity, section: "Admin", tooltip: "Monitor the health and cadence of all automated tasks" },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText, section: "Admin", tooltip: "Security audit trail — who did what and when" },
  { href: "/tools/ccs-calculator", label: "CCS Calculator", icon: Wrench, section: "Admin", tooltip: "Child Care Subsidy cost estimator" },
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
