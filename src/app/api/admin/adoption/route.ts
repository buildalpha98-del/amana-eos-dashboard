import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import type { Role } from "@prisma/client";

// Checklist item counts per role — must match GettingStartedContent.tsx
const CHECKLIST_COUNTS: Record<string, number> = {
  staff: 12,
  member: 14,
  coordinator: 14,
  admin: 15,
  marketing: 12,
  head_office: 14,
  owner: 15,
};

function getTotalForRole(role: string): number {
  return CHECKLIST_COUNTS[role] ?? CHECKLIST_COUNTS.staff;
}

export async function GET() {
  const allowedRoles: Role[] = ["owner", "admin", "head_office"];
  const { error } = await requireAuth(allowedRoles);
  if (error) return error;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastLoginAt: true,
      gettingStartedProgress: true,
      createdAt: true,
    },
    orderBy: { lastLoginAt: "desc" },
  });

  const totalUsers = users.length;
  let loggedInToday = 0;
  let loggedInThisWeek = 0;
  let neverLoggedIn = 0;
  let onboardingComplete = 0;

  const userList = users.map((u) => {
    const progress =
      (u.gettingStartedProgress as Record<string, boolean>) ?? {};
    const totalCount = getTotalForRole(u.role);
    const completedCount = Math.min(
      Object.values(progress).filter(Boolean).length,
      totalCount,
    );
    const onboardingPct =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    if (onboardingPct === 100) onboardingComplete++;

    if (!u.lastLoginAt) {
      neverLoggedIn++;
    } else {
      if (u.lastLoginAt >= todayStart) loggedInToday++;
      if (u.lastLoginAt >= weekAgo) loggedInThisWeek++;
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      onboardingPct,
      createdAt: u.createdAt.toISOString(),
    };
  });

  // Sort: most recent login first, never-logged-in at bottom
  userList.sort((a, b) => {
    if (!a.lastLoginAt && !b.lastLoginAt) return 0;
    if (!a.lastLoginAt) return 1;
    if (!b.lastLoginAt) return -1;
    return new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime();
  });

  return NextResponse.json({
    totalUsers,
    loggedInToday,
    loggedInThisWeek,
    neverLoggedIn,
    onboardingComplete,
    userList,
  });
}
