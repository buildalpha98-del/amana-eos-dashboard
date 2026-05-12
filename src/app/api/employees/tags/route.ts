/**
 * GET /api/employees/tags
 *
 * Returns the distinct list of tags applied to any user the caller
 * can see. Used by the /team Tag filter dropdown so admins can
 * multi-select from known tags instead of typing them blind.
 *
 * Scoping: matches the employee list scope — centre-scoped roles
 * only see tags on users at their service; marketing sees the full
 * org-wide set (same exception applied in /api/employees). Returned
 * tags are sorted alphabetically.
 *
 * Tags are admin-managed (free-form, lowercased on write — see
 * src/lib/staff-tags.ts). This route is read-only; mutations go
 * through PATCH /api/users/[id]/profile.
 *
 * 2026-05-12: introduced (Bucket C).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";

export const GET = withApiAuth(async (_req, session) => {
  const role = session!.user.role ?? "";

  // Same marketing-bypass as the list route — marketing sees all
  // tags org-wide; other scoped roles see only their service's.
  const scopedServiceIds: string[] | null =
    role === "marketing"
      ? null
      : (await getCentreScope(session!)).serviceIds;

  if (scopedServiceIds !== null && scopedServiceIds.length === 0) {
    throw ApiError.forbidden(
      "You don't have a service assigned. Contact an admin.",
    );
  }

  const rows = await prisma.user.findMany({
    where: scopedServiceIds === null ? {} : { serviceId: { in: scopedServiceIds } },
    select: { tags: true },
  });

  const seen = new Set<string>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) seen.add(tag);
  }

  const tags = Array.from(seen).sort();
  return NextResponse.json({ tags });
});
