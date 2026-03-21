import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";

/**
 * POST /api/users/backfill-prefs
 *
 * Backfills notification preferences for all users who have null or empty
 * notificationPrefs, using role-appropriate defaults.
 *
 * Auth: owner or admin only.
 */
export async function POST() {
  const { session, error } = await requireAuth();
  if (error || !session) {
    return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden — owner or admin only" }, { status: 403 });
  }

  // Find users with null notificationPrefs
  // Prisma Json? fields are null when not set
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { notificationPrefs: { equals: Prisma.DbNull } },
        { notificationPrefs: { equals: Prisma.JsonNull } },
        { notificationPrefs: { equals: {} } },
      ],
    },
    select: { id: true, role: true },
  });

  let updated = 0;

  for (const user of users) {
    const defaults = getDefaultNotificationPrefs(user.role);
    await prisma.user.update({
      where: { id: user.id },
      data: { notificationPrefs: defaults },
    });
    updated++;
  }

  return NextResponse.json({
    message: `Backfilled notification preferences for ${updated} user${updated !== 1 ? "s" : ""}`,
    updated,
    total: users.length,
  });
}
