/**
 * Pure DTO projector for the `/api/employees` list response.
 *
 * Takes a Prisma `User & { service }` row + viewer role, returns the
 * shape consumed by the EH-style employee directory list.
 *
 * The marketing role gets a PII-stripped projection — email + phone are
 * nulled out at this boundary so they can never leak into the response
 * body, even when a future formatter change accidentally widens the
 * shape. The narrow `select` on the route is the FIRST line of defense
 * (excludes TFN, bank account, DOB, address); this projector is the
 * SECOND line (strips email + phone for marketing viewers).
 *
 * 2026-05-04: introduced for the Teams tab redesign (PR 1).
 */

import type { Role } from "@prisma/client";

export interface EmployeeRowInput {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  phone: string | null;
  role: string;
  active: boolean;
  lastLoginAt: Date | null;
  tags: string[];
  /** Primary/home service (User.serviceId). Null when the user was
   *  invited without a service. */
  service: { id: string; name: string } | null;
  /** 2026-07-08 — additional service memberships (UserServiceMembership
   *  rows, status=active). Populated when a staff was added to a
   *  centre via /services/[id]/staff without being their home service.
   *  Excludes the primary service (deduplicated at the API layer). */
  additionalServices: Array<{ id: string; name: string }>;
  /** 2026-06-03 — null when the user hasn't been linked to their
   *  Employment Hero Payroll employee record. Drives the red
   *  "needs payroll link" badge on the /team list. */
  employmentHeroEmployeeId: number | null;
  /** 2026-06-03 — true when the user has at least one contract in
   *  "active" or "contract_draft" status. False drives the yellow
   *  "no contract issued" badge on the /team list. */
  hasActiveContract: boolean;
}

export type EmployeeStatus = "active" | "pending" | "deactivated";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null; // null when stripped (marketing viewer)
  avatar: string | null;
  phone: string | null; // null when stripped (marketing viewer)
  role: string;
  tags: string[];
  service: { id: string; name: string } | null;
  /** 2026-07-08: additional centres this user is a member of via
   *  UserServiceMembership. Empty for users whose only service is
   *  their primary one (or who have no service at all). */
  additionalServices: Array<{ id: string; name: string }>;
  status: EmployeeStatus;
  /** True when the user is linked to an EH Payroll employee record.
   *  Drives a red "needs payroll link" indicator in the /team list. */
  payrollLinked: boolean;
  /** True when the user has at least one active or draft contract.
   *  False drives a yellow "no contract issued" indicator. */
  hasActiveContract: boolean;
}

function deriveStatus(input: EmployeeRowInput): EmployeeStatus {
  if (!input.active) return "deactivated";
  return input.lastLoginAt === null ? "pending" : "active";
}

export function formatEmployeeRow(
  input: EmployeeRowInput,
  viewerRole: Role | string,
): EmployeeRow {
  const stripped = viewerRole === "marketing";
  return {
    id: input.id,
    name: input.name,
    email: stripped ? null : input.email,
    avatar: input.avatar,
    phone: stripped ? null : input.phone,
    role: input.role,
    tags: input.tags ?? [],
    service: input.service,
    additionalServices: input.additionalServices ?? [],
    status: deriveStatus(input),
    payrollLinked: input.employmentHeroEmployeeId !== null,
    hasActiveContract: input.hasActiveContract,
  };
}
