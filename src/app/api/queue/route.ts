import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getCentreScope } from "@/lib/centre-scope";

/**
 * GET /api/queue — returns the current user's assigned reports and todos
 * Query params: seat, serviceCode, status, limit, offset
 * Admin-only: view=all returns ALL reports/todos across all users (grouped by assignee)
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;
  const userRole = (session!.user as { role?: string }).role;
  const { searchParams } = new URL(req.url);
  const seat = searchParams.get("seat");
  const serviceCode = searchParams.get("serviceCode");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const viewAll = searchParams.get("view") === "all";

  // Only owner/admin/head_office can view all queues
  const isAdmin = userRole === "owner" || userRole === "admin" || userRole === "head_office";
  const showAll = viewAll && isAdmin;

  // Centre scoping for non-admin users
  const { serviceIds } = await getCentreScope(session);

  // Build report filters
  const reportWhere: Record<string, unknown> = showAll ? {} : { assignedToId: userId };
  if (seat) reportWhere.seat = seat;
  if (serviceCode) reportWhere.serviceCode = serviceCode;
  if (status && status !== "all") reportWhere.status = status;
  else if (!status) reportWhere.status = "pending";

  // For scoped roles viewing all: restrict to their centres' reports
  if (showAll && serviceIds !== null) {
    // Resolve service codes for the user's centre IDs
    const userServices = await prisma.service.findMany({
      where: serviceIds.length > 0 ? { id: { in: serviceIds } } : { id: "__no_access__" },
      select: { code: true },
    });
    const codes = userServices.map((s) => s.code);
    if (codes.length > 0) {
      reportWhere.serviceCode = { in: codes };
    } else {
      reportWhere.serviceCode = "__no_access__";
    }
  }

  // Build todo filters
  const todoWhere: Record<string, unknown> = showAll ? {} : { assignedToId: userId };
  if (serviceCode) todoWhere.centreId = serviceCode;
  if (status === "all") {
    // show all
  } else {
    todoWhere.completed = false;
  }

  const [reports, todos, reportCount, todoCount] = await Promise.all([
    prisma.coworkReport.findMany({
      where: reportWhere,
      include: {
        service: { select: { id: true, name: true, code: true } },
        ...(showAll && {
          assignedTo: { select: { id: true, name: true, email: true } },
        }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.coworkTodo.findMany({
      where: todoWhere,
      orderBy: [{ dueTime: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.coworkReport.count({ where: reportWhere }),
    prisma.coworkTodo.count({ where: todoWhere }),
  ]);

  return NextResponse.json({
    reports,
    todos,
    counts: { reports: reportCount, todos: todoCount },
  });
}
