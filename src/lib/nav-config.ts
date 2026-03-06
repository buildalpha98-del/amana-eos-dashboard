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
  Target,
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
  // Engagement
  { href: "/crm", label: "CRM", icon: Target, section: "Engagement", tooltip: "Sales pipeline & lead management" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, section: "Engagement" },
  { href: "/communication", label: "Communication", icon: Radio, section: "Engagement" },
  { href: "/projects", label: "Projects", icon: FolderKanban, section: "Engagement" },
  { href: "/meetings", label: "Meetings", icon: Presentation, section: "Engagement" },
  // HR
  { href: "/timesheets", label: "Timesheets", icon: ClipboardList, section: "HR", tooltip: "Import OWNA rosters, approve & export to Xero" },
  { href: "/leave", label: "Leave", icon: CalendarDays, section: "HR", tooltip: "Request & manage staff leave" },
  { href: "/contracts", label: "Contracts", icon: FileSignature, section: "HR", tooltip: "Employment contracts & award rates" },
  // Support
  { href: "/tickets", label: "Tickets", icon: MessageSquare, section: "Support" },
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
