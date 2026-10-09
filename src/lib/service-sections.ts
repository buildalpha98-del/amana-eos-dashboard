/**
 * The sections of a centre's page (/services/[id]) — ONE list, used by the
 * page's own menu AND, for shared centre mailbox logins, by the main
 * sidebar (src/components/layout/CentreSidebarNav.tsx, 2026-10-08: Daniel
 * wanted a centre account's whole left-hand menu to BE its centre, OWNA
 * style). Add a section here and both menus get it.
 *
 * Moved verbatim out of services/[id]/page.tsx; visibleServiceSections()
 * is that page's former inline role filtering.
 */
import type React from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Baby,
  GraduationCap,
  CalendarX,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  Eye,
  FileSignature,
  FolderKanban,
  FolderOpen,
  LayoutList,
  LogIn,
  MessageCircle,
  MessageSquare,
  Wrench,
  Mountain,
  Radio,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  Sunrise,
  Target,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

export interface SubTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * When true, the sub-tab is hidden for everyone except owner + admin.
   * 2026-04-30: introduced for Weekly Data — surfaces revenue/cost
   * breakdowns that State Manager, Director of Service, Educator, and
   * Marketing should not see.
   */
  adminOnly?: boolean;
}

export interface TabGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  subTabs: SubTab[];
}

// Base Daily Ops sub-tabs always visible. `casual-bookings` is appended
// at render-time for admin/coord only (see `visibleGroups` below).
export const DAILY_OPS_BASE_SUBTABS: SubTab[] = [
  { key: "attendance", label: "Attendance", icon: ClipboardList },
  // The door (staff-UX Round 3, 2026-10-09): Sign In / Out and Roll Call
  // were two screens over the same records, each missing half of the job.
  // One screen now; the old `sign-in-out` key is an alias (SUB_TAB_ALIASES)
  // so bookmarks and links keep landing here.
  { key: "roll-call", label: "Sign in & out", icon: LogIn },
  // Moved here from the Families group 2026-08-01 per Daniel — posting
  // about the day is part of running the day.
  { key: "posts", label: "Posts", icon: MessageCircle },
  { key: "medication", label: "Medication", icon: Activity },
  { key: "roster", label: "Weekly Roster", icon: CalendarDays },
  { key: "checklists", label: "Checklists", icon: ClipboardCheck },
];

/**
 * Retired `?tab=&sub=` links and where they live now. The page resolves
 * every link through `resolveSectionLink` before choosing what to draw,
 * and the deep-link guard accepts these, so bookmarks keep working.
 */
const SECTION_ALIASES: Record<string, { tab: string; sub?: string }> = {
  // Round 3 (2026-10-09): Sign In / Out merged into the door.
  "daily:sign-in-out": { tab: "daily", sub: "roll-call" },
  // Children and Families became sections of their own (2026-10-09).
  "daily:children": { tab: "children" },
  // Live ratio is on each room's card on Today; the history is the
  // Compliance → Ratio log (2026-10-09).
  "daily:ratios": { tab: "compliance", sub: "ratios" },
  "family:children": { tab: "children" },
  "family:families": { tab: "families" },
  "family:": { tab: "families" },
};

export function resolveSectionLink(
  tab: string | null | undefined,
  sub: string | null | undefined,
): { tab: string | null; sub: string | null } {
  const hit = tab ? (SECTION_ALIASES[`${tab}:${sub ?? ""}`] ?? (tab === "family" ? SECTION_ALIASES["family:"] : undefined)) : undefined;
  if (hit) return { tab: hit.tab, sub: hit.sub ?? null };
  return { tab: tab ?? null, sub: sub ?? null };
}

/** Every retired link, for the deep-link guard. */
export const RETIRED_SECTION_LINKS = Object.keys(SECTION_ALIASES);

export const CASUAL_BOOKINGS_SUBTAB: SubTab = {
  key: "casual-bookings",
  label: "Casual settings",
  icon: CalendarClock,
};

export const tabGroups: TabGroup[] = [
  {
    key: "today",
    label: "Today",
    icon: Sunrise,
    subTabs: [],
  },
  {
    key: "overview",
    // 2026-08-06: sub-tabs, mirroring OWNA's Configure list. This was
    // one long scroll of eight cards — contact details through to
    // excursion forms — and finding anything meant knowing how far down
    // it lived. The 2026-08-04 note below still holds for the FIELDS:
    // the address and the welcome text belong to the same record. What
    // changed is that rooms, settings and forms are separate subjects
    // that were only sharing a page because they shared a tab.
    //
    // 2026-10-09: named "Configure", as in OWNA, and "Rooms & fees" split
    // in three. It was one phone-scroll holding five subjects — capacity
    // advice, rooms, fee policy, fee changes, closures — and you only
    // found the closures by scrolling past every fee setting.
    label: "Configure",
    icon: Building2,
    subTabs: [
      { key: "info", label: "Service info", icon: Building2 },
      { key: "settings", label: "Settings", icon: SlidersHorizontal },
      { key: "rooms", label: "Rooms", icon: DoorOpen },
      { key: "fees", label: "Fees", icon: Receipt },
      { key: "closures", label: "Closures", icon: CalendarX },
      { key: "forms", label: "Forms & excursions", icon: FileSignature },
      { key: "about", label: "What families see", icon: BookOpen },
    ],
  },
  // 2026-05-14: Staff tab — primary users (User.serviceId === this service)
  // + additional UserServiceMembership rows in one unified list. Admin-tier
  // and Director-of-own-service can manage additional memberships here.
  {
    key: "staff",
    label: "Staff",
    icon: Users,
    // 2026-10-09, Daniel's OWNA screenshots: everything about staff in one
    // dropdown. Roster becomes OWNA's Build Roster next; Logs / timesheets
    // follows.
    subTabs: [
      { key: "manage", label: "Manage staff", icon: Users },
      { key: "inductions", label: "Staff inductions", icon: GraduationCap },
      { key: "roster", label: "Roster", icon: CalendarDays },
    ],
  },
  {
    key: "daily",
    label: "Daily Ops",
    icon: Activity,
    subTabs: DAILY_OPS_BASE_SUBTABS,
  },
  // Who attends here (2026-07-31). Separate sections since 2026-10-09,
  // per Daniel and as in OWNA: a child and a family are different things
  // to look up — Children was also duplicated inside Daily Ops, and
  // Families sat behind a group that opened on the families list.
  {
    key: "children",
    label: "Children",
    icon: Baby,
    subTabs: [],
  },
  {
    key: "families",
    label: "Families",
    icon: Users,
    subTabs: [],
  },
  // The centre's parent messages (2026-10-09, Daniel's decision): the
  // same conversations the office sees in the Contact Centre, locked to
  // this centre. Coordinators, the centre login and the office — never
  // educators (canSeeMessages).
  {
    key: "messages",
    label: "Messages",
    icon: MessageSquare,
    subTabs: [],
  },
  {
    key: "program",
    label: "Program",
    icon: BookOpen,
    subTabs: [
      { key: "activities", label: "Activities", icon: LayoutList },
      // 2026-08-06: the library lives WHERE programming happens. It used
      // to be a top-level nav item, which meant leaving the centre you
      // were planning for to fetch a template for it.
      { key: "library", label: "Activity Library", icon: BookOpen },
      { key: "menu", label: "Menu", icon: UtensilsCrossed },
      { key: "observations", label: "Observations", icon: Eye },
    ],
  },
  {
    key: "eos",
    label: "EOS",
    icon: Target,
    subTabs: [
      { key: "scorecard", label: "Scorecard", icon: BarChart3 },
      { key: "rocks", label: "Rocks", icon: Mountain },
      { key: "todos", label: "To-Dos", icon: CheckSquare },
      { key: "issues", label: "Issues", icon: AlertCircle },
      { key: "projects", label: "Projects", icon: FolderKanban },
      // 2026-04-30: admin-only — hides revenue/cost figures from State
      // Manager / Director of Service / Educator / Marketing per training-
      // session permission audit.
      { key: "weekly", label: "Weekly Data", icon: CalendarDays, adminOnly: true },
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    subTabs: [
      { key: "audits", label: "Audits", icon: ShieldCheck },
      { key: "qip", label: "QIP", icon: ClipboardCheck },
      { key: "reflections", label: "Reflections", icon: Target },
      // 2026-04-30: in-service incidents log. Cross-service /incidents
      // is now hidden from member/staff (sidebar tightened in PR #37);
      // this is where Director of Service + Educators log their own.
      { key: "incidents", label: "Incidents", icon: AlertTriangle },
      // 2026-10-09, OWNA parity: report it, track it to fixed.
      { key: "hazards", label: "Hazards", icon: Wrench },
      { key: "risk", label: "Risk", icon: ShieldCheck },
      { key: "headcounts", label: "Headcounts", icon: Users },
      { key: "ratios", label: "Ratio log", icon: Users },
      { key: "registers", label: "Visitors & registers", icon: ClipboardList },
      { key: "comms", label: "Comms", icon: Radio },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    subTabs: [
      { key: "budget", label: "Budget", icon: Wallet },
      // 2026-08-03, per Daniel: family billing belongs where the centre
      // is, not only on the org-wide page. Same records, scoped — and
      // the bulk panel's "all families" is confined to this centre.
      // adminOnly because /api/families is owner/head_office/admin — a
      // coordinator would otherwise reach a tab that only ever errors.
      { key: "billing", label: "Billing", icon: Receipt, adminOnly: true },
      // 2026-06-29: "Financials" sub-tab removed — it was a stub that
      // just pointed users at the global /financials page. If admins
      // want per-service P&L they now navigate to Financials from the
      // sidebar with the centre filter set instead of hitting a dead
      // end here.
      { key: "approvals", label: "Approvals", icon: CheckCircle2 },
    ],
  },
  // 2026-10-08, per Daniel: everything for a regulator spot check in one
  // place — the policy library (synced from SharePoint) and every staff
  // member's files at this centre. Staff files: coordinators + admins only
  // (filtered in visibleGroups; the API enforces it too).
  {
    key: "documents",
    label: "Documents",
    icon: FolderOpen,
    subTabs: [
      { key: "policies", label: "Policies & procedures", icon: BookOpen },
      { key: "handbook", label: "Handbook & Amana Way", icon: BookOpen },
      { key: "staff-files", label: "Staff files", icon: Users },
    ],
  },
];


/**
 * What an EDUCATOR (`staff`) sees of their centre (2026-10-08). They used
 * to get the whole menu — Staff, Families, EOS, Finance, Settings — and
 * most of it answered "forbidden". This is the floor of an OSHC shift:
 * the day's jobs first, then the program, the safety registers and the
 * policies. Anything not listed is simply not there.
 */
const EDUCATOR_SECTIONS: Record<string, string[]> = {
  today: [],
  daily: ["roll-call", "medication", "checklists", "posts"],
  children: [],
  program: ["activities", "menu", "observations"],
  compliance: ["incidents", "hazards", "headcounts", "registers", "risk"],
  documents: ["policies", "handbook"],
};

/** Role-based visibility — the same rules the page applied inline. */
export function visibleServiceSections(opts: {
  /** An educator (`staff`) — gets the short floor-of-the-shift menu. */
  isEducator?: boolean;
  /** owner/head_office/admin — sees admin-only sub-tabs (Weekly Data, Billing). */
  isAdminPlus: boolean;
  /** Admin tier, or the Director of THIS centre. */
  canSeeCasualBookings: boolean;
  /** Admin tier or a Director — Documents → Staff files. */
  canSeeStaffFiles: boolean;
  /** Admin tier, or this centre's Coordinator / centre login — parent messages. */
  canSeeMessages?: boolean;
}): TabGroup[] {
  if (opts.isEducator) {
    return tabGroups
      .filter((g) => g.key in EDUCATOR_SECTIONS)
      .map((g) => {
        const keep = EDUCATOR_SECTIONS[g.key];
        // Their order, not the full menu's — the door leads the day.
        const subTabs = keep
          .map((k) => g.subTabs.find((s) => s.key === k))
          .filter((s): s is SubTab => !!s);
        return { ...g, subTabs };
      });
  }
  return tabGroups
    .filter((g) => !g.adminOnly || opts.isAdminPlus)
    .filter((g) => g.key !== "messages" || opts.canSeeMessages)
    .map((g) => {
      let subTabs = g.subTabs;
      // Strip admin-only sub-tabs (Weekly Data) for non-admins. Server
      // routes still enforce — this is a visibility cleanup so the pill
      // doesn't 403 when clicked.
      if (!opts.isAdminPlus) subTabs = subTabs.filter((s) => !s.adminOnly);
      // Casual Bookings for admin/coord on this service only.
      if (g.key === "daily" && opts.canSeeCasualBookings) {
        subTabs = [...subTabs, CASUAL_BOOKINGS_SUBTAB];
      }
      // Staff files are for the centre's Director and admins, not educators.
      if (g.key === "documents" && !opts.canSeeStaffFiles) {
        subTabs = subTabs.filter((s) => s.key !== "staff-files");
      }
      return subTabs === g.subTabs ? g : { ...g, subTabs };
    });
}
