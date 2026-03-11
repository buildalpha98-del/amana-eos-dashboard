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
  // EOS
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "EOS", tooltip: "Your command centre overview" },
  { href: "/my-portal", label: "My Portal", icon: UserCircle, section: "EOS", tooltip: "Your personal HR hub — profile, leave, training & more" },
  { href: "/vision", label: "Vision / V-TO", icon: Eye, section: "EOS", tooltip: "Vision/Traction Organiser — your long-term goals & strategic plan" },
  { href: "/rocks", label: "Rocks", icon: Mountain, section: "EOS", tooltip: "Quarterly priorities — 90-day goals for the team" },
  { href: "/todos", label: "To-Dos", icon: CheckSquare, section: "EOS", tooltip: "7-day action items from weekly meetings" },
  { href: "/issues", label: "Issues", icon: AlertCircle, section: "EOS", tooltip: "Issues List — track & solve using IDS (Identify, Discuss, Solve)" },
  { href: "/scorecard", label: "Scorecard", icon: BarChart3, section: "EOS", tooltip: "Weekly measurables & KPIs" },
  // Operations
  { href: "/financials", label: "Financials", icon: DollarSign, section: "Operations" },
  { href: "/performance", label: "Performance", icon: Trophy, section: "Operations" },
  { href: "/services", label: "Services", icon: Building2, section: "Operations" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, section: "Operations" },
  { href: "/compliance/templates", label: "Audit Templates", icon: ClipboardList, section: "Operations", tooltip: "Manage audit template items & upload .docx checklists" },
  { href: "/holiday-quest", label: "Holiday Quest", icon: Palmtree, section: "Operations", tooltip: "Vacation care day planner & promo generator" },
  // Strategy
  { href: "/scenarios", label: "Scenarios", icon: Calculator, section: "Strategy", tooltip: "What-if scenario modelling & financial projections" },
  { href: "/data-room", label: "Data Room", icon: FolderLock, section: "Strategy", tooltip: "Due diligence document tracker & exit readiness scoring" },
  { href: "/reports/board", label: "Board Reports", icon: FileSpreadsheet, section: "Strategy", tooltip: "Monthly board & investor report generator" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, section: "Strategy", tooltip: "Ask questions about your dashboard data" },
  // Engagement
  { href: "/enquiries", label: "Enquiries", icon: UserPlus, section: "Engagement", tooltip: "Parent enquiry pipeline — track B2C leads from first contact to retention" },
  { href: "/crm", label: "CRM", icon: Target, section: "Engagement", tooltip: "Sales pipeline & lead management" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, section: "Engagement" },
  { href: "/communication", label: "Communication", icon: Radio, section: "Engagement" },
  { href: "/conversions", label: "Conversions", icon: Repeat, section: "Engagement", tooltip: "Track casual-to-regular booking conversions" },
  { href: "/projects", label: "Projects", icon: FolderKanban, section: "Engagement" },
  { href: "/meetings", label: "Meetings", icon: Presentation, section: "Engagement" },
  // HR
  { href: "/recruitment", label: "Recruitment", icon: Briefcase, section: "HR", tooltip: "Track vacancies, candidates & staff referrals" },
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, section: "HR", tooltip: "Import OWNA rosters, approve & export to Xero" },
  { href: "/leave", label: "Leave", icon: CalendarDays, section: "HR", tooltip: "Request & manage staff leave" },
  { href: "/contracts", label: "Contracts", icon: FileSignature, section: "HR", tooltip: "Employment contracts & award rates" },
  // Support
  { href: "/tickets", label: "Tickets", icon: MessageSquare, section: "Support" },
  // Tools
  { href: "/tools/ccs-calculator", label: "CCS Calculator", icon: Wrench, section: "Tools", tooltip: "Child Care Subsidy cost estimator" },
  // Admin
  { href: "/documents", label: "Documents", icon: FileText, section: "Admin" },
  { href: "/onboarding", label: "Staff Lifecycle", icon: GraduationCap, section: "Admin", tooltip: "Onboarding, LMS & offboarding" },
  { href: "/team", label: "Team", icon: Users, section: "Admin" },
  { href: "/settings", label: "Settings", icon: Settings, section: "Admin" },
];

/**
 * Derive page title map from navItems for TopBar usage.
 * Additional entries (like /crm/templates) can be spread in by the consumer.
 */
export const pageTitlesFromNav: Record<string, string> = Object.fromEntries(
  navItems.map((item) => [item.href, item.label])
);
