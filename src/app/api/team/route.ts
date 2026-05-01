import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/pagination";
import { withApiAuth } from "@/lib/server-auth";
import { parseRoleParam } from "@/lib/role-enum";

export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);

  // Optional filters (all safe on unauthenticated-shaped data — all users
  // in this org can already see each other's names via /directory).
  const serviceParam = searchParams.get("service")?.trim() || "";
  const roleParam = searchParams.get("role")?.trim() || "";
  const qParam = searchParams.get("q")?.trim() || "";

  const userWhere: Prisma.UserWhereInput = { active: true };
  if (serviceParam) userWhere.serviceId = serviceParam;
  // 2026-05-01: previously had a hand-rolled VALID_ROLES with a duplicate
  // "member" entry left over from the coordinator-collapse rename. Now
  // delegated to the shared parseRoleParam helper which keeps the enum
  // values in one place. Behaviour unchanged: invalid roles are silently
  // ignored (not 400'd) so the test "?role=hacker → where.role undefined"
  // still passes.
  const role = parseRoleParam(roleParam);
  if (role) userWhere.role = role;
  if (qParam) userWhere.name = { contains: qParam, mode: "insensitive" };

  const users = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      service: { select: { id: true, name: true } },
      _count: {
        select: {
          ownedRocks: {
            where: {
              deleted: false,
              status: { in: ["on_track" as const, "off_track" as const] },
            },
          },
          assignedTodos: { where: { deleted: false } },
          ownedIssues: {
            where: {
              deleted: false,
              status: { in: ["open" as const, "in_discussion" as const] },
            },
          },
          managedServices: { where: { status: "active" as const } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    ...(pagination ? { skip: pagination.skip, take: pagination.limit } : {}),
  });

  // Todo completion % per user
  const userIds = users.map((u) => u.id);
  const todoStats = await prisma.todo.groupBy({
    by: ["assigneeId", "status"],
    where: { assigneeId: { in: userIds }, deleted: false },
    _count: true,
  });

  const todoMap: Record<string, { total: number; completed: number }> = {};
  todoStats.forEach((stat) => {
    if (!stat.assigneeId) return;
    if (!todoMap[stat.assigneeId])
      todoMap[stat.assigneeId] = { total: 0, completed: 0 };
    todoMap[stat.assigneeId].total += stat._count;
    if (stat.status === "complete")
      todoMap[stat.assigneeId].completed += stat._count;
  });

  // Active rocks per user
  const rocks = await prisma.rock.findMany({
    where: {
      deleted: false,
      ownerId: { in: userIds },
      status: { in: ["on_track", "off_track"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      percentComplete: true,
      priority: true,
      ownerId: true,
    },
  });

  const rocksByUser: Record<string, typeof rocks> = {};
  rocks.forEach((r) => {
    if (!r.ownerId) return;
    if (!rocksByUser[r.ownerId]) rocksByUser[r.ownerId] = [];
    rocksByUser[r.ownerId].push(r);
  });

  const teamMembers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    service: u.service ? { id: u.service.id, name: u.service.name } : null,
    activeRocks: u._count.ownedRocks,
    totalTodos: todoMap[u.id]?.total || 0,
    completedTodos: todoMap[u.id]?.completed || 0,
    todoCompletionPct:
      todoMap[u.id] && todoMap[u.id].total > 0
        ? Math.round((todoMap[u.id].completed / todoMap[u.id].total) * 100)
        : 0,
    openIssues: u._count.ownedIssues,
    managedServices: u._count.managedServices,
    rocks: rocksByUser[u.id] || [],
  }));

  if (pagination) {
    const total = await prisma.user.count({ where: userWhere });
    return NextResponse.json({
      items: teamMembers,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  return NextResponse.json(teamMembers);
});
