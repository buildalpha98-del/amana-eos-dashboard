/**
 * GET /api/induction/pipeline — admin view of everyone currently in the
 * induction flow (new_starter / in_training / awaiting_signoff), for the
 * pipeline board. Cleared users are excluded.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(
  async () => {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        inductionStatus: { in: ["new_starter", "in_training", "awaiting_signoff"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        inductionStatus: true,
        inductionDueDate: true,
        inductionGraceUntil: true,
        updatedAt: true,
        service: { select: { name: true } },
      },
      orderBy: { inductionDueDate: "asc" },
    });

    const now = Date.now();
    const rows = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      serviceName: u.service?.name ?? null,
      status: u.inductionStatus,
      dueDate: u.inductionDueDate,
      graceUntil: u.inductionGraceUntil,
      // Approximate days since the last status change (updatedAt is a proxy).
      daysInStage: Math.max(0, Math.floor((now - new Date(u.updatedAt).getTime()) / 86400000)),
    }));

    return NextResponse.json({ rows });
  },
  { roles: [...ADMIN_ROLES] },
);
