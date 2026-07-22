import type { Role } from "@prisma/client";

export type ServiceAccessLevel = "view_only" | "contributor" | "admin";
export type ServiceMembershipStatus = "active" | "inactive";

export interface MembershipDefaults {
  roleAtService: string;
  accessLevel: ServiceAccessLevel;
  startDate: string;
  endDate: string | null;
  status: ServiceMembershipStatus;
}

interface UserShape {
  role: Role;
  createdAt: Date | string;
}

const ROLE_AT_SERVICE: Record<Role, string> = {
  owner: "Owner",
  head_office: "State Manager",
  admin: "Admin",
  marketing: "Marketing",
  member: "OSHC Educator",
  staff: "Educator",
  eos_viewer: "EOS Viewer",
  eos_implementer: "EOS Implementer",
  eos: "EOS Member",
};

const ACCESS_LEVEL: Record<Role, ServiceAccessLevel> = {
  owner: "admin",
  head_office: "admin",
  admin: "admin",
  marketing: "contributor",
  member: "admin",
  staff: "contributor",
  // EOS Viewer never gets per-service write access — they're a view
  // surface only. Use the most-restricted level the union allows.
  eos_viewer: "contributor",
  // EOS Implementer is org-wide for EOS but not a per-service member, so
  // it gets no per-service write access either.
  eos_implementer: "contributor",
  // EOS Member has admin-tier org-wide access.
  eos: "admin",
};

function toIsoDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function deriveMembershipDefaults(user: UserShape): MembershipDefaults {
  return {
    roleAtService: ROLE_AT_SERVICE[user.role],
    accessLevel: ACCESS_LEVEL[user.role],
    startDate: toIsoDate(user.createdAt),
    endDate: null,
    status: "active",
  };
}
