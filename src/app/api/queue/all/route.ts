import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
/**
 * GET /api/queue/all — admin view of all user queues
 * Returns summary counts per user + unassigned
 */
export const GET = withApiAuth(async (req, session) => {
  // Get all users who have assigned reports or todos
  const [reportCounts, todoCounts, unassignedReports, unassignedTodos] =
    await Promise.all([
      prisma.coworkReport.groupBy({
        by: ["assignedToId"],
        where: { assignedToId: { not: null }, status: "pending" },
        _count: true,
      }),
      prisma.coworkTodo.groupBy({
        by: ["assignedToId"],
        where: { assignedToId: { not: null }, completed: false },
        _count: true,
      }),
      prisma.coworkReport.count({
        where: { assignedToId: null, status: "pending" },
      }),
      prisma.coworkTodo.count({
        where: { assignedToId: null, completed: false },
      }),
    ]);

  // Collect all user IDs
  const userIds = new Set<string>();
  for (const r of reportCounts) {
    if (r.assignedToId) userIds.add(r.assignedToId);
  }
  for (const t of todoCounts) {
    if (t.assignedToId) userIds.add(t.assignedToId);
  }

  // Fetch user details
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true, email: true, role: true, avatar: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));
  const reportMap = new Map(
    reportCounts.map((r) => [r.assignedToId!, r._count])
  );
  const todoMap = new Map(
    todoCounts.map((t) => [t.assignedToId!, t._count])
  );

  const queues = Array.from(userIds).map((id) => ({
    user: userMap.get(id)!,
    reports: reportMap.get(id) || 0,
    todos: todoMap.get(id) || 0,
    total: (reportMap.get(id) || 0) + (todoMap.get(id) || 0),
  }));

  // Sort by total descending
  queues.sort((a, b) => b.total - a.total);

  return NextResponse.json({
    queues,
    unassigned: { reports: unassignedReports, todos: unassignedTodos },
  });
}, { roles: ["owner", "head_office"] });
