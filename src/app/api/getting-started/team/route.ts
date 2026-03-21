import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import type { Role } from "@prisma/client";

// Checklist item counts per role — must match the CHECKLISTS in GettingStartedContent.tsx
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

// GET /api/getting-started/team — team onboarding progress (admin+ only)
export async function GET() {
  const allowedRoles: Role[] = ["owner", "admin", "head_office"];
  const { session, error } = await requireAuth(allowedRoles);
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      gettingStartedProgress: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  const mapped = users.map((u) => {
    const progress =
      (u.gettingStartedProgress as Record<string, boolean>) ?? {};
    const totalCount = getTotalForRole(u.role);
    const completedCount = Object.values(progress).filter(Boolean).length;
    // Clamp to totalCount in case stale keys exist
    const clamped = Math.min(completedCount, totalCount);
    const percentage =
      totalCount > 0 ? Math.round((clamped / totalCount) * 100) : 0;

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatar: u.avatar,
      completedCount: clamped,
      totalCount,
      percentage,
      lastActivity: u.updatedAt?.toISOString() ?? null,
    };
  });

  const summary = {
    totalUsers: mapped.length,
    fullyOnboarded: mapped.filter((u) => u.percentage === 100).length,
    inProgress: mapped.filter(
      (u) => u.percentage > 0 && u.percentage < 100,
    ).length,
    notStarted: mapped.filter((u) => u.percentage === 0).length,
  };

  return NextResponse.json({ users: mapped, summary });
}
