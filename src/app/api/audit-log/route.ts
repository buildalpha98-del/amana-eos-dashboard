import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES_WITH_EOS } from "@/lib/role-permissions";

/**
 * GET /api/audit-log
 *
 * Returns security audit log entries. Admin tier + `eos` — mirrors the page
 * access granted by `rolePageAccess`, which previously 403'd EOS Members on
 * a page their own sidebar offered them.
 * Query params: ?page=1&limit=50&action=user.login&actorId=xxx
 */
export const GET = withApiAuth(async (req) => {

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)),
  );
  const action = url.searchParams.get("action") ?? undefined;
  const actorId = url.searchParams.get("actorId") ?? undefined;

  const where = {
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.securityAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.securityAuditLog.count({ where }),
  ]);

  return NextResponse.json({
    entries,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}, { roles: [...ADMIN_ROLES_WITH_EOS] });
