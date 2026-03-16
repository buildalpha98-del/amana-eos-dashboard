import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/settings/audit-log
 *
 * Returns security audit log entries. Owner-only.
 * Query params: ?page=1&limit=50&action=user.login
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
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
}
