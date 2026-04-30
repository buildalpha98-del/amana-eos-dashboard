/**
 * Static registry of commands for the ⌘K CommandMenu.
 *
 * Not mount-time — actions live here as a module-level list, avoiding both
 * dead-code risk (actions registered by unmounted pages disappearing) and
 * ghost-action risk (unmounted pages' actions firing in unexpected contexts).
 *
 * Each action declares:
 *   - id:        stable identifier (used for keys + analytics)
 *   - label:     what the user sees in the palette
 *   - hint:      optional secondary text (shortcut hint, subtitle)
 *   - section:   grouping header in the palette
 *   - predicate: (ctx) => boolean — gates by role + pathname
 *   - handler:   (ctx, router) => void | Promise<void>
 *
 * Dispatch is always router.push or fire-and-forget fetch. Actions never take
 * mutable references to page-scoped state, so they're safe to fire regardless
 * of what page is currently mounted.
 */

import type { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  Plus,
  ClipboardCheck,
  Mountain,
  CheckSquare,
  AlertCircle,
  Megaphone,
  Send,
  Utensils,
  Stethoscope,
  FileText,
  BookOpen,
  Calendar,
  UserPlus,
  Eye,
} from "lucide-react";

export interface CommandActionContext {
  role?: Role;
  pathname?: string;
  /** Current service scope if the user has one. */
  serviceId?: string | null;
}

export type CommandRouter = {
  push: (href: string) => void;
};

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  section: string;
  icon?: LucideIcon;
  keywords?: string[];
  predicate?: (ctx: CommandActionContext) => boolean;
  handler: (ctx: CommandActionContext, router: CommandRouter) => void;
}

const ORG_WIDE_ROLES: Role[] = ["owner", "head_office"];
const ADMIN_ROLES: Role[] = ["owner", "head_office", "admin"];
const COORD_UP: Role[] = ["owner", "head_office", "admin", "member"];

const isOrgWide = (ctx: CommandActionContext) =>
  ctx.role ? ORG_WIDE_ROLES.includes(ctx.role) : false;
const isAdminUp = (ctx: CommandActionContext) =>
  ctx.role ? ADMIN_ROLES.includes(ctx.role) : false;
const isCoordUp = (ctx: CommandActionContext) =>
  ctx.role ? COORD_UP.includes(ctx.role) : false;

export const COMMAND_ACTIONS: CommandAction[] = [
  // ── Create ──────────────────────────────────────────────
  {
    id: "create-rock",
    label: "Create Rock",
    hint: "Add a quarterly priority",
    section: "Create",
    icon: Mountain,
    keywords: ["new", "quarterly", "priority"],
    predicate: isCoordUp,
    handler: (_ctx, router) => router.push("/rocks?create=1"),
  },
  {
    id: "create-todo",
    label: "Create To-Do",
    hint: "Add a 7-day action",
    section: "Create",
    icon: CheckSquare,
    predicate: () => true,
    handler: (_ctx, router) => router.push("/todos?create=1"),
  },
  {
    id: "create-issue",
    label: "Create Issue",
    hint: "Log for IDS discussion",
    section: "Create",
    icon: AlertCircle,
    predicate: () => true,
    handler: (_ctx, router) => router.push("/issues?create=1"),
  },
  {
    id: "create-observation",
    label: "Log Observation",
    hint: "Document a learning moment",
    section: "Create",
    icon: Eye,
    keywords: ["observation", "learning", "story", "mtop"],
    predicate: isCoordUp,
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=observations&create=1`
        : "/services?observationCreate=1";
      router.push(base);
    },
  },
  {
    id: "create-reflection",
    label: "Write Reflection",
    hint: "Critical / weekly / team",
    section: "Create",
    icon: FileText,
    keywords: ["reflection", "reflect", "practice"],
    predicate: isCoordUp,
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=reflections&create=1`
        : "/services?reflectionCreate=1";
      router.push(base);
    },
  },
  {
    id: "log-medication",
    label: "Log Medication Dose",
    hint: "Dual sign-off required",
    section: "Create",
    icon: Stethoscope,
    keywords: ["medication", "mar", "dose"],
    predicate: isCoordUp,
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=medication&log=1`
        : "/services?medicationLog=1";
      router.push(base);
    },
  },
  {
    id: "create-risk-assessment",
    label: "New Risk Assessment",
    section: "Create",
    icon: ClipboardCheck,
    keywords: ["risk", "hazard", "excursion"],
    predicate: isCoordUp,
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=risk&create=1`
        : "/services?riskCreate=1";
      router.push(base);
    },
  },
  {
    id: "generate-newsletter",
    label: "Generate Weekly Newsletter",
    hint: "AI draft from Program + Menu",
    section: "Create",
    icon: Megaphone,
    keywords: ["newsletter", "ai", "parents", "weekly"],
    predicate: isAdminUp,
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=comms&newsletter=1`
        : "/services?newsletter=1";
      router.push(base);
    },
  },
  {
    id: "create-enrolment",
    label: "New Enrolment",
    section: "Create",
    icon: UserPlus,
    predicate: isCoordUp,
    handler: (_ctx, router) => router.push("/enrolments?create=1"),
  },
  {
    id: "send-message",
    label: "Send Message",
    section: "Create",
    icon: Send,
    predicate: () => true,
    handler: (_ctx, router) => router.push("/messaging?compose=1"),
  },

  // ── Quick nav ──────────────────────────────────────────
  {
    id: "today-roll-call",
    label: "Roll Call — Today",
    section: "Quick nav",
    icon: ClipboardCheck,
    predicate: () => true,
    handler: (_ctx, router) => router.push("/roll-call"),
  },
  {
    id: "todays-menu",
    label: "Today's Menu",
    section: "Quick nav",
    icon: Utensils,
    predicate: (ctx) => isCoordUp(ctx),
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=program&sub=menu`
        : "/services";
      router.push(base);
    },
  },
  {
    id: "weekly-roster",
    label: "Weekly Roster",
    section: "Quick nav",
    icon: Calendar,
    predicate: isCoordUp,
    handler: (ctx, router) => {
      const base = ctx.serviceId
        ? `/services/${ctx.serviceId}?tab=roster`
        : "/services";
      router.push(base);
    },
  },
  {
    id: "audit-templates",
    label: "Audit Templates",
    section: "Quick nav",
    icon: BookOpen,
    predicate: isAdminUp,
    handler: (_ctx, router) => router.push("/compliance/templates"),
  },
  {
    id: "ai-drafts",
    label: "AI Drafts (all)",
    hint: "Review + bulk-triage",
    section: "Quick nav",
    icon: Plus,
    predicate: isOrgWide,
    handler: (_ctx, router) => router.push("/admin/ai-drafts"),
  },
];

/** Filter the registry to actions the current user can invoke. */
export function getAvailableActions(
  ctx: CommandActionContext,
): CommandAction[] {
  return COMMAND_ACTIONS.filter((action) =>
    action.predicate ? action.predicate(ctx) : true,
  );
}

/** Fuzzy-match the query against action label + keywords. Simple substring
 *  match is good enough for ~50 actions; upgrade to fuse.js if ever needed. */
export function filterActions(
  actions: CommandAction[],
  query: string,
): CommandAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter((a) => {
    const hay = [a.label, a.hint ?? "", ...(a.keywords ?? [])]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
