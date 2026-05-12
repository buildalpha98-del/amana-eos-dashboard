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
  service: { id: string; name: string } | null;
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
  status: EmployeeStatus;
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
    status: deriveStatus(input),
  };
}
