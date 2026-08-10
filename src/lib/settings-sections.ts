/**
 * The shape of the Settings area.
 *
 * Settings grew to fourteen stacked cards on one scrolling page, plus six
 * sub-pages reachable only from the sidebar. Finding anything meant either
 * knowing how far down it lived or knowing it wasn't on the page at all.
 * This module is the map: which groups exist, what belongs in each, who
 * can see it, and what someone might type when looking for it.
 *
 * It is data rather than JSX so the grouping can be tested and so the
 * search index can't drift from what's rendered — both come from here.
 *
 * `roles` is a VISIBILITY gate for the nav, not an authorisation boundary.
 * Every section still enforces its own permissions server-side; hiding a
 * link the user can't use is a courtesy, not a control.
 */

import type { Role } from "@prisma/client";

export type SettingsGroupKey =
  | "organisation"
  | "people"
  | "integrations"
  | "communications"
  | "system";

export interface SettingsItem {
  key: string;
  label: string;
  /** One line, shown under the label in search results. */
  description: string;
  roles: Role[];
  /**
   * Where the item lives. `inline` items render as cards in the group;
   * `href` items are their own page and render as a link row.
   */
  href?: string;
  /** Extra words someone might search for. The label is always matched. */
  keywords?: string[];
}

export interface SettingsGroup {
  key: SettingsGroupKey;
  label: string;
  description: string;
  items: SettingsItem[];
}

/** Everyone at or above admin. Spelled out rather than imported so the
 *  nav's visibility can't silently change when a role is added. */
const ADMIN_TIER: Role[] = ["owner", "head_office", "admin"];
const OWNER_ONLY: Role[] = ["owner"];
const OWNER_HO: Role[] = ["owner", "head_office"];

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: "organisation",
    label: "Organisation",
    description: "Who you are, how the app is branded, and org-wide limits.",
    items: [
      {
        key: "org",
        label: "Organisation details",
        description: "Name, brand colours, and the runtime configuration.",
        roles: OWNER_ONLY,
        keywords: ["brand", "colour", "color", "logo", "name", "theme"],
      },
      {
        key: "org-config",
        label: "Runtime configuration",
        description:
          "Email sender, default educator ratio, health score weights.",
        roles: ["owner", "admin"],
        href: "/settings/organisation",
        keywords: ["ratio", "health score", "sender", "brevo", "weights"],
      },
      {
        key: "banners",
        label: "System banners",
        description: "Org-wide notices shown across the dashboard.",
        roles: OWNER_HO,
        keywords: ["notice", "announcement", "alert", "message"],
      },
      {
        key: "budget-tiers",
        label: "Purchase budget tiers",
        description: "Monthly centre spend limits by size.",
        roles: OWNER_ONLY,
        keywords: ["spend", "purchase", "budget", "limit", "approval"],
      },
    ],
  },
  {
    key: "people",
    label: "People & access",
    description: "Accounts, what each role can reach, and time-clock devices.",
    items: [
      {
        key: "users",
        label: "User management",
        description: "Invite, deactivate, and change roles.",
        roles: OWNER_HO,
        keywords: ["staff", "invite", "account", "deactivate", "role", "team"],
      },
      {
        key: "permissions",
        label: "Role permissions",
        description: "The page-by-page access matrix.",
        roles: ["owner", "admin"],
        href: "/settings/permissions",
        keywords: ["access", "matrix", "page", "restrict", "role"],
      },
      {
        key: "kiosks",
        label: "Time-clock kiosks",
        description: "Devices staff clock in and out on.",
        roles: ADMIN_TIER,
        keywords: ["clock", "timeclock", "device", "tablet", "ipad", "sign in"],
      },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    description: "The outside systems this dashboard talks to.",
    items: [
      {
        key: "xero",
        label: "Xero",
        description: "Accounting connection and account mapping.",
        roles: OWNER_ONLY,
        keywords: ["accounting", "finance", "invoice", "ledger", "tracking"],
      },
      {
        key: "owna",
        label: "OWNA",
        description: "Childcare system sync — children, attendance, enquiries.",
        roles: ["owner", "admin"],
        keywords: ["childcare", "sync", "attendance", "ccs", "enrolment"],
      },
      {
        key: "payroll",
        label: "Payroll",
        description: "Employment Hero connection and employee sync.",
        roles: OWNER_HO,
        href: "/settings/payroll",
        keywords: ["employment hero", "wages", "pay", "timesheet", "employee"],
      },
      {
        key: "api-keys",
        label: "API keys",
        description: "Keys for automations that push data in.",
        roles: OWNER_ONLY,
        keywords: ["token", "automation", "cowork", "scope", "secret"],
      },
    ],
  },
  {
    key: "communications",
    label: "Communications",
    description: "What the system sends, and proof of what it sent.",
    items: [
      {
        key: "email-templates",
        label: "Email templates",
        description: "Subject and body for transactional emails.",
        roles: ["owner", "admin"],
        href: "/settings/email-templates",
        keywords: ["email", "template", "subject", "body", "transactional"],
      },
      {
        key: "notification-log",
        label: "Notification log",
        description: "Every notification the system has sent.",
        roles: ["owner", "head_office", "admin", "member"],
        keywords: ["sent", "history", "audit", "delivery", "email", "push"],
      },
    ],
  },
  {
    key: "system",
    label: "System",
    description: "Activity, usage, and the tools for setting things up.",
    items: [
      {
        key: "activity-log",
        label: "Activity log",
        description: "Who changed what, across the dashboard.",
        roles: ADMIN_TIER,
        keywords: ["audit", "history", "changes", "who"],
      },
      {
        key: "adoption",
        label: "Adoption metrics",
        description: "Which parts of the dashboard are actually being used.",
        roles: ADMIN_TIER,
        keywords: ["usage", "engagement", "metrics", "stats"],
      },
      {
        key: "ai-usage",
        label: "AI usage",
        description: "Token spend and which features are consuming it.",
        roles: OWNER_HO,
        keywords: ["tokens", "cost", "spend", "assistant", "llm"],
      },
      {
        key: "ai-knowledge",
        label: "AI knowledge",
        description: "Content the assistant searches when staff ask questions.",
        roles: ADMIN_TIER,
        href: "/settings/ai-knowledge",
        keywords: ["assistant", "knowledge", "documents", "search", "rag"],
      },
      {
        key: "seed",
        label: "Seed template data",
        description:
          "Populate default templates, policies, checklists and guides.",
        roles: ["owner", "admin"],
        href: "/settings/seed",
        keywords: ["template", "default", "populate", "demo", "setup"],
      },
    ],
  },
];

/** Items in this group the role may see. */
export function visibleItems(
  group: SettingsGroup,
  role: Role | null | undefined,
): SettingsItem[] {
  if (!role) return [];
  return group.items.filter((i) => i.roles.includes(role));
}

/**
 * Groups with at least one visible item.
 *
 * A group whose every item is gated away should not appear at all — an
 * empty "Integrations" panel reads as a broken page, not as a permission
 * boundary.
 */
export function visibleGroups(role: Role | null | undefined): SettingsGroup[] {
  return SETTINGS_GROUPS.filter((g) => visibleItems(g, role).length > 0);
}

/**
 * Search across everything the role can see.
 *
 * Matches label, description and keywords, case-insensitively. Returns
 * items paired with their group so a result can say where it lives —
 * "Kiosks, in People & access" is a more useful answer than "Kiosks".
 */
export function searchSettings(
  query: string,
  role: Role | null | undefined,
): Array<{ group: SettingsGroup; item: SettingsItem }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const out: Array<{ group: SettingsGroup; item: SettingsItem }> = [];
  for (const group of visibleGroups(role)) {
    for (const item of visibleItems(group, role)) {
      const haystack = [
        item.label,
        item.description,
        ...(item.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) out.push({ group, item });
    }
  }
  return out;
}

/**
 * The group to land on — the one asked for, if the role can see it,
 * otherwise the first they can.
 *
 * Never returns a group the role can't see, so a stale bookmark or a
 * hand-typed `?section=` can't render an empty page.
 */
export function resolveGroup(
  requested: string | null | undefined,
  role: Role | null | undefined,
): SettingsGroup | null {
  const groups = visibleGroups(role);
  if (groups.length === 0) return null;
  const match = groups.find((g) => g.key === requested);
  return match ?? groups[0];
}
