import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// 0. Role display names (human-readable labels for the UI)
// ---------------------------------------------------------------------------

/** Maps database role values → user-facing display names */
export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  owner: "Owner",
  head_office: "Head Office",
  admin: "State Manager",
  member: "Centre Director",
  staff: "Educator",
};

/** Inverse lookup: display name → role key */
export function roleFromDisplayName(displayName: string): Role | undefined {
  const entry = (Object.entries(ROLE_DISPLAY_NAMES) as [Role, string][]).find(
    ([, label]) => label.toLowerCase() === displayName.toLowerCase()
  );
  return entry?.[0];
}

// ---------------------------------------------------------------------------
// 1. Page-level access
// ---------------------------------------------------------------------------

/** Every routable page in the dashboard */
export const allPages = [
  "/dashboard",
  "/my-portal",
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
  "/activity-library",
  "/documents",
  "/onboarding",
  "/timesheets",
  "/leave",
  "/contracts",
  "/team",
  "/settings",
  "/profile",
  "/crm",
  "/crm/templates",
] as const;

export type AppPage = (typeof allPages)[number];

/**
 * Pages each role is allowed to visit.
 *
 * - **owner**        : full access
 * - **head_office**  : full access (org settings / API keys hidden in UI, not page-blocked)
 * - **admin**        : everything except Settings & CRM templates
 * - **member**       : limited subset; no Financials, Performance, Team, Settings, Marketing, or Tickets
 * - **staff**        : very limited — service-scoped
 */
export const rolePageAccess: Record<Role, readonly AppPage[]> = {
  owner: allPages,
  head_office: allPages,
  admin: allPages.filter((p) => p !== "/settings" && p !== "/crm/templates"),
  member: [
    "/dashboard",
    "/my-portal",
    "/rocks",
    "/todos",
    "/issues",
    "/meetings",
    "/services",
    "/activity-library",
    "/communication",
    "/compliance",
    "/documents",
    "/onboarding",
    "/profile",
  ],
  staff: [
    "/dashboard",
    "/my-portal",
    "/activity-library",
    "/documents",
    "/communication",
    "/onboarding",
    "/todos",
    "/compliance",
    "/profile",
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

  // Activity Library
  "activity_library.view",
  "activity_library.create",
  "activity_library.edit",
  "activity_library.delete",

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

  // HR — Timesheets
  "timesheets.view",
  "timesheets.create",
  "timesheets.import",
  "timesheets.approve",
  "timesheets.export_to_xero",

  // HR — Leave
  "leave.view",
  "leave.request",
  "leave.approve",
  "leave.sync_balances",

  // HR — Contracts
  "contracts.view",
  "contracts.create",
  "contracts.edit",
  "contracts.acknowledge",

  // Policies
  "policies.view",
  "policies.create",
  "policies.manage",
  "policies.acknowledge",

  // Offboarding
  "offboarding.view",
  "offboarding.create",
  "offboarding.manage",

  // Self-Service Portal
  "my_portal.view",

  // Activity log
  "activity_log.view",

  // Settings page visibility
  "settings.view",

  // Permissions info table (owner only)
  "permissions.view",

  // API Keys (owner only)
  "api_keys.view",
  "api_keys.manage",

  // CRM
  "crm.view",
  "crm.create",
  "crm.edit",
  "crm.manage_templates",
] as const;

export type Feature = (typeof features)[number];

const ownerFeatures: readonly Feature[] = features; // everything

// Head Office: same as owner MINUS org settings, imports, API keys, Xero, permissions table
const headOfficeFeatures: readonly Feature[] = features.filter(
  (f) =>
    f !== "org_settings.edit" &&
    f !== "users.import" &&
    f !== "permissions.view" &&
    f !== "api_keys.view" &&
    f !== "api_keys.manage" &&
    f !== "xero.connect" &&
    f !== "xero.manage_mappings" &&
    f !== "timesheets.export_to_xero" &&
    f !== "crm.manage_templates"
);

const adminFeatures: readonly Feature[] = features.filter(
  (f) =>
    // Admins (State Managers) can NOT do:
    f !== "org_settings.edit" &&
    // Admins CAN now manage users (create, edit role, deactivate)
    // but NOT import users or change someone to owner
    f !== "users.import" &&
    f !== "settings.view" &&
    f !== "permissions.view" &&
    f !== "xero.connect" &&
    f !== "xero.manage_mappings" &&
    f !== "timesheets.export_to_xero" &&
    f !== "api_keys.view" &&
    f !== "api_keys.manage" &&
    f !== "crm.manage_templates"
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
  "activity_library.view",
  "attendance.view",
  "attendance.create",
  "attendance.edit",
  // HR
  "leave.view",
  "leave.request",
  "contracts.view",
  "contracts.acknowledge",
  "policies.view",
  "policies.acknowledge",
  "offboarding.view",
  "my_portal.view",
  "timesheets.view",
  "timesheets.create",
];

const staffFeatures: readonly Feature[] = [
  "activity_library.view",
  "documents.view",
  "communication.view",
  "onboarding.view",
  "lms.view",
  "todos.view",
  "todos.create",
  "todos.edit",
  "compliance.view",
  // HR
  "leave.view",
  "leave.request",
  "contracts.view",
  "contracts.acknowledge",
  "policies.view",
  "policies.acknowledge",
  "my_portal.view",
  "timesheets.view",
  "timesheets.create",
];

export const roleFeatures: Record<Role, readonly Feature[]> = {
  owner: ownerFeatures,
  head_office: headOfficeFeatures,
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

/** Does the role meet a minimum level? owner > head_office > admin > member > staff */
const rolePriority: Record<Role, number> = {
  owner: 5,
  head_office: 4,
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
  head_office: boolean;
  admin: boolean;
  member: boolean;
  staff: boolean;
}

/** Informational table data for the Settings > Permissions panel */
export const permissionsTable: PermissionRow[] = [
  // Pages
  { section: "Pages", label: "Dashboard", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Vision / V-TO", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Rocks", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "To-Dos", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Issues", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Scorecard", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Meetings", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Services", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Activity Library", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Projects", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Pages", label: "Communication", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Documents", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Onboarding & LMS", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Financials", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Performance", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Compliance", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Tickets", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Marketing", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Team", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Settings", owner: true, head_office: true, admin: false, member: false, staff: false },
  { section: "Pages", label: "My Portal", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Pages", label: "Timesheets", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Leave Management", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Contracts", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "Profile", owner: true, head_office: true, admin: true, member: true, staff: true },

  // Actions
  { section: "Actions", label: "View / edit Attendance", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Actions", label: "Create / edit Rocks", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Actions", label: "Create / edit To-Dos", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Create / edit Issues", owner: true, head_office: true, admin: true, member: true, staff: false },
  { section: "Actions", label: "Edit Scorecard", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit financial data", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit Marketing posts", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Manage Tickets", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit Documents", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "View Onboarding & LMS", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Manage Onboarding & LMS", owner: true, head_office: true, admin: true, member: false, staff: false },

  // Import / Bulk
  { section: "Actions", label: "Import staff (CSV/XLSX)", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Actions", label: "Import attendance data", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Import compliance certs", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Bulk create To-Dos", owner: true, head_office: true, admin: true, member: false, staff: false },

  // HR Actions
  { section: "Actions", label: "Import timesheets (OWNA)", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Approve timesheets", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Export timesheets to Xero", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Actions", label: "Request leave", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Approve / reject leave", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Manage contracts", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Acknowledge contracts", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Manage policies", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Acknowledge policies", owner: true, head_office: true, admin: true, member: true, staff: true },
  { section: "Actions", label: "Manage offboarding", owner: true, head_office: true, admin: true, member: false, staff: false },

  { section: "Admin", label: "View activity log", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Admin", label: "Manage users (invite, roles, deactivate)", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Admin", label: "Delete users permanently", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Admin", label: "Edit organisation settings", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Admin", label: "Connect / manage Xero", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Admin", label: "View permissions overview", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Admin", label: "Manage API keys", owner: true, head_office: false, admin: false, member: false, staff: false },

  // CRM
  { section: "Pages", label: "CRM Pipeline", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Pages", label: "CRM Email Templates", owner: true, head_office: false, admin: false, member: false, staff: false },
  { section: "Actions", label: "View leads & pipeline", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Create / edit leads", owner: true, head_office: true, admin: true, member: false, staff: false },
  { section: "Actions", label: "Manage CRM email templates", owner: true, head_office: false, admin: false, member: false, staff: false },
];
