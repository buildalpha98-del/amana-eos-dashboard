import type { Role } from "@prisma/client";

// Page access per role
const roleAccessMap: Record<Role, string[]> = {
  owner: [
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
    "/documents",
    "/team",
    "/settings",
  ],
  admin: [
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
    "/documents",
    "/team",
    // No /settings
  ],
  member: [
    "/dashboard",
    "/vision",
    "/rocks",
    "/todos",
    "/issues",
    "/scorecard",
    "/meetings",
    "/services",
    "/projects",
    "/documents",
    // No /financials, /performance, /team, /settings, /tickets
  ],
};

export function canAccessPage(role: Role | undefined, href: string): boolean {
  // While session/role is loading, show all items — auth middleware protects routes server-side
  if (!role) return true;
  const allowed = roleAccessMap[role];
  if (!allowed) return true;
  return allowed.some((path) => href === path || href.startsWith(path + "/"));
}

export function getAccessiblePages(role: Role): string[] {
  return roleAccessMap[role] ?? [];
}
