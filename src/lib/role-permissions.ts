import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// 1. Page-level access
// ---------------------------------------------------------------------------

/** Every routable page in the dashboard */
export const allPages = [
  "/dashboard",
  "/vision",
  "/rocks",
  "/todos",
  "/issues",
  "/scorecard",
  "/meetings",
  "/financials",
  "/performance",
  "/services",
  "/projects",
  "/tickets",
  "/marketing",
  "/communication",
  "/compliance",
  "/documents",
  "/onboarding",
  "/team",
  "/settings",
] as const;

export type AppPage = (typeof allPages)[number];

/**
 * Pages each role is allowed to visit.
 *
 * - **owner**  : full access
 * - **admin**  : everything except Settings (org settings, user role management)
 * - **member** : a limited subset; no Financials, Performance, Team, Settings,
 *                Marketing, or Tickets unless explicitly granted later.
 * - **staff**  : very limited — only their service context, documents, communication,
 *                onboarding/LMS, and a simplified dashboard.
 */
export const rolePageAccess: Record<Role, readonly AppPage[]> = {
  owner: allPages,
  admin: allPages.filter((p) => p !== "/settings"),
  member: [
    "/dashboard",
    "/rocks",
    "/todos",
    "/issues",
    "/meetings",
    "/services",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
  ],
  staff: [
    "/dashboard",
    "/documents",
    "/communication",
    "/onboarding",
    "/todos",
    "/compliance",
  ],
};

// ---------------------------------------------------------------------------
// 2. Feature / action-level permissions
// ---------------------------------------------------------------------------

/**
 * Fine-grained capabilities that can be checked independently of page access.
 * Each key is a human-readable capability name.
 */
export const features = [
  // Organisation
  "org_settings.view",
  "org_settings.edit",

  // User / team management
  "users.list",
  "users.create",
  "users.edit_role",
  "users.deactivate",

  // Financials
  "financials.view",
  "financials.create",
  "financials.edit",

  // Performance
  "performance.view",

  // Team page
  "team.view",
  "team.manage",

  // Marketing
  "marketing.view",
  "marketing.create",
  "marketing.edit",

  // Tickets
  "tickets.view",
  "tickets.create",
  "tickets.manage",

  // Communication
  "communication.view",
  "communication.create",
  "communication.manage",

  // Documents
  "documents.view",
  "documents.create",
  "documents.edit",
  "documents.delete",

  // Rocks / Todos / Issues (everyone can view; ownership checks happen in logic)
  "rocks.view",
  "rocks.create",
  "rocks.edit",
  "rocks.delete",

  "todos.view",
  "todos.create",
  "todos.edit",
  "todos.delete",

  "issues.view",
  "issues.create",
  "issues.edit",
  "issues.delete",

  // Scorecard
  "scorecard.view",
  "scorecard.edit",

  // Meetings
  "meetings.view",
  "meetings.create",
  "meetings.edit",

  // Services
  "services.view",
  "services.create",
  "services.edit",

  // Projects
  "projects.view",
  "projects.create",
  "projects.edit",

  // Attendance
  "attendance.view",
  "attendance.create",
  "attendance.edit",

  // Compliance
  "compliance.view",
  "compliance.create",
  "compliance.manage",

  // Onboarding / LMS
  "onboarding.view",
  "onboarding.create",
  "onboarding.manage",
  "lms.view",
  "lms.create",
  "lms.manage",

  // Import / Bulk
  "users.import",
  "attendance.import",
  "compliance.import",
  "todos.bulk_create",

  // Xero integration
  "xero.connect",
  "xero.sync",
  "xero.manage_mappings",

  // Activity log
  "activity_log.view",

  // Settings page visibility
  "settings.view",

  // Permissions info table (owner only)
  "permissions.view",
] as const;

export type Feature = (typeof features)[number];

const ownerFeatures: readonly Feature[] = features; // everything

const adminFeatures: readonly Feature[] = features.filter(
  (f) =>
    // Admins can NOT do:
    f !== "org_settings.edit" &&
    f !== "users.create" &&
    f !== "users.edit_role" &&
    f !== "users.deactivate" &&
    f !== "users.import" &&
    f !== "settings.view" &&
    f !== "permissions.view" &&
    f !== "xero.connect" &&
    f !== "xero.manage_mappings"
);

const memberFeatures: readonly Feature[] = [
  // Service-scoped access
  "rocks.view",
  "rocks.create",
  "rocks.edit",
  "todos.view",
  "todos.create",
  "todos.edit",
  "issues.view",
  "issues.create",
  "issues.edit",
  "meetings.view",
  "communication.view",
  "compliance.view",
  "documents.view",
  "services.view",
  "onboarding.view",
  "lms.view",
  "attendance.view",
  "attendance.create",
  "attendance.edit",
];

const staffFeatures: readonly Feature[] = [
  "documents.view",
  "communication.view",
  "onboarding.view",
  "lms.view",
  "todos.view",
  "todos.create",
  "todos.edit",
  "compliance.view",
];

export const roleFeatures: Record<Role, readonly Feature[]> = {
  owner: ownerFeatures,
  admin: adminFeatures,
  member: memberFeatures,
  staff: staffFeatures,
};

// ---------------------------------------------------------------------------
// 3. Helper functions
// ---------------------------------------------------------------------------

/** Can the given role access a page (or a sub-path of it)? */
export function canAccessPage(role: Role | undefined, href: string): boolean {
  if (!role) return true; // still loading; let server middleware decide
  const allowed = rolePageAccess[role];
  if (!allowed) return true;
  return allowed.some((path) => href === path || href.startsWith(path + "/"));
}

/** Convenience: return the list of accessible page paths */
export function getAccessiblePages(role: Role): readonly AppPage[] {
  return rolePageAccess[role] ?? [];
}

/** Does the role have a specific feature/capability? */
export function hasFeature(role: Role | undefined, feature: Feature): boolean {
  if (!role) return false;
  return (roleFeatures[role] as readonly string[]).includes(feature);
}

/** Does the role meet a minimum level? owner > admin > member > staff */
const rolePriority: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  staff: 1,
};

export function hasMinRole(
  currentRole: Role | undefined,
  requiredRole: Role
): boolean {
  if (!currentRole) return false;
  return rolePriority[currentRole] >= rolePriority[requiredRole];
}

// ---------------------------------------------------------------------------
// 4. Human-readable labels (for the permissions info table in Settings)
// ---------------------------------------------------------------------------

export interface PermissionRow {
  /** Section label */
  section: string;
  /** Human description */
  label: string;
  owner: boolean;
  admin: boolean;
  member: boolean;
  staff: boolean;
}

/** Informational table data for the Settings > Permissions panel */
export const permissionsTable: PermissionRow[] = [
  // Pages
  { section: "Pages", label: "Dashboard", owner: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Vision / V-TO", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Rocks", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "To-Dos", owner: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Issues", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Scorecard", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Meetings", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Services", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Projects", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Communication", owner: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Documents", owner: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Onboarding & LMS", owner: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Financials", owner: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Performance", owner: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Compliance", owner: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Tickets", owner: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Marketing", owner: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Team", owner: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Settings", owner: true, admin: false, member: false, staff: false },

  // Actions
  { section: "Actions", label: "View / edit Attendance", owner: true, admin: true, member: true, staff: false },
  { section: "Actions", label: "Create / edit Rocks", owner: true, admin: true, member: true, staff: false },
  { section: "Actions", label: "Create / edit To-Dos", owner: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Create / edit Issues", owner: true, admin: true, member: true, staff: false },
  { section: "Actions", label: "Edit Scorecard", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit financial data", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit Marketing posts", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Manage Tickets", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit Documents", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "View Onboarding & LMS", owner: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Manage Onboarding & LMS", owner: true, admin: true, member: false, staff: false },

  // Admin
  { section: "Actions", label: "Import staff (CSV/XLSX)", owner: true, admin: false, member: false, staff: false },
  { section: "Actions", label: "Import attendance data", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Import compliance certs", owner: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Bulk create To-Dos", owner: true, admin: true, member: false, staff: false },

  // Admin
  { section: "Admin", label: "View activity log", owner: true, admin: true, member: false, staff: false },
  { section: "Admin", label: "Manage users (invite, roles, deactivate)", owner: true, admin: false, member: false, staff: false },
  { section: "Admin", label: "Edit organisation settings", owner: true, admin: false, member: false, staff: false },
  { section: "Admin", label: "Connect / manage Xero", owner: true, admin: false, member: false, staff: false },
  { section: "Admin", label: "View permissions overview", owner: true, admin: false, member: false, staff: false },
];
