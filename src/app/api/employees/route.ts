/**
 * GET /api/employees
 *
 * Paginated employee directory for the new Teams tab. Service-scoped per role
 * (admin: all; member/staff: own service; marketing: all but PII stripped).
 *
 * Query params (all optional):
 *   q          - search across name + email (case-insensitive substring)
 *   status     - active | pending | deactivated (default: hide deactivated)
 *   s          - comma-separated serviceIds
 *   r          - comma-separated roles
 *   sort       - name | role | service | status (default: name)
 *   page       - 1-indexed (default 1)
 *   pageSize   - 1..200 (default 50)
 *
 * Returns: { employees, total, page, pageSize, totalPages, pendingCount }
 *   pendingCount is the count of admin-visible users with
 *   `active && !lastLoginAt`, scoped the same way as the list. Drives
 *   the "Resend all pending (N)" button in the page header. Always 0
 *   for non-admin-tier viewers (member/staff/marketing).
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { buildListWhere } from "@/lib/employees/build-list-where";
import { formatEmployeeRow } from "@/lib/employees/format-employee-row";

const querySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "pending", "deactivated"]).optional(),
  s: z.string().optional(),
  r: z.string().optional(),
  tag: z.string().optional(),
  sort: z.enum(["name", "role", "service", "status"]).default("name"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    s: searchParams.get("s") ?? undefined,
    r: searchParams.get("r") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const params = parsed.data;

  const role = session.user.role ?? "";

  // Marketing has full org-wide list access (with PII stripping in
  // formatEmployeeRow below) — explicitly bypass getCentreScope's
  // single-service restriction for this role on this route only. Other
  // routes that use getCentreScope retain marketing's service scoping.
  const scopedServiceIds: string[] | null =
    role === "marketing"
      ? null
      : (await getCentreScope(session)).serviceIds;

  // Defensive: a centre-scoped role with an empty scope (no service
  // attached) should 403 rather than return everyone with `serviceId in []`.
  if (scopedServiceIds !== null && scopedServiceIds.length === 0) {
    throw ApiError.forbidden(
      "You don't have a service assigned. Contact an admin.",
    );
  }

  const where = buildListWhere({
    params,
    scopedServiceIds,
    hideDeactivatedByDefault: true,
  });

  // Sort mapping. Whitelist enforced via Zod enum above.
  const orderBy = (() => {
    switch (params.sort) {
      case "role":
        return { role: "asc" as const };
      case "service":
        return { service: { name: "asc" as const } };
      case "status":
        return { active: "desc" as const };
      case "name":
      default:
        return { name: "asc" as const };
    }
  })();

  const skip = (params.page - 1) * params.pageSize;

  // Narrow select is the FIRST line of PII defense — it deliberately
  // excludes `User.taxFileNumber`, `bankAccountNumber`, `dateOfBirth`,
  // `address`, etc. so those fields can't accidentally leak via a future
  // formatter change. `formatEmployeeRow` is the SECOND line (strips
  // email + phone for marketing role).
  // pendingCount drives the admin-only "Resend all pending (N)" button
  // in the page header. Only compute it for admin-tier viewers so we
  // don't pay for a per-page count on every member/staff load.
  const isAdminTier = ["owner", "head_office", "admin"].includes(role);
  const pendingWhere = isAdminTier
    ? {
        active: true,
        lastLoginAt: null,
        ...(scopedServiceIds !== null
          ? { serviceId: { in: scopedServiceIds } }
          : {}),
      }
    : null;

  const [users, total, pendingCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip,
      take: params.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        role: true,
        active: true,
        lastLoginAt: true,
        tags: true,
        service: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
    pendingWhere ? prisma.user.count({ where: pendingWhere }) : Promise.resolve(0),
  ]);

  const employees = users.map((u) =>
    formatEmployeeRow(
      {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar ?? null,
        phone: u.phone ?? null,
        role: u.role,
        active: u.active,
        lastLoginAt: u.lastLoginAt,
        tags: u.tags ?? [],
        service: u.service ?? null,
      },
      role,
    ),
  );

  return NextResponse.json({
    employees,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    pendingCount,
  });
});
