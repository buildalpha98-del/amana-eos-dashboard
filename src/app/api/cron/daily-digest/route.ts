import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { dailyDigestEmail } from "@/lib/email-templates";
import { acquireCronLock } from "@/lib/cron-guard";

/**
 * GET /api/cron/daily-digest
 *
 * Daily cron (8 AM AEST) — sends a morning digest email to each active user
 * with their overdue todos, off-track rocks, expiring certs, and unread announcements.
 *
 * Auth: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Idempotency guard — prevent duplicate digest emails on retry
  const guard = await acquireCronLock("daily-digest", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 86400000);

    // Get all active users
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true, serviceId: true },
    });

    const resend = getResend();
    let emailsSent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const user of users) {
      // Overdue todos
      const overdueTodos = await prisma.todo.count({
        where: {
          assigneeId: user.id,
          status: { in: ["pending", "in_progress"] },
          dueDate: { lt: now },
        },
      });

      // Off-track rocks
      const offTrackRocks = await prisma.rock.count({
        where: {
          ownerId: user.id,
          status: "off_track",
        },
      });

      // Expiring compliance certs (within 30 days)
      const expiringCerts = await prisma.complianceCertificate.count({
        where: {
          userId: user.id,
          expiryDate: { lte: in30d },
        },
      });

      // Unread announcements (announcements not yet read by this user)
      const unreadAnnouncements = await prisma.announcement.count({
        where: {
          deleted: false,
          readReceipts: { none: { userId: user.id } },
          ...(user.serviceId
            ? {
                OR: [
                  { audience: "all" },
                  { serviceId: user.serviceId },
                ],
              }
            : {}),
        },
      });

      // Skip if nothing to report
      const total = overdueTodos + offTrackRocks + expiringCerts + unreadAnnouncements;
      if (total === 0) {
        skipped++;
        continue;
      }

      const dashboardUrl = `${process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au"}/dashboard`;

      if (resend) {
        try {
          const { subject, html } = dailyDigestEmail(user.name, {
            overdueTodos,
            offTrackRocks,
            expiringCerts,
            unreadAnnouncements,
          }, dashboardUrl);

          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject,
            html,
          });
          emailsSent++;
        } catch (err) {
          errors.push(`Failed ${user.email}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      } else {
        console.log(`[Digest] ${user.name}: ${overdueTodos} todos, ${offTrackRocks} rocks, ${expiringCerts} certs, ${unreadAnnouncements} announcements`);
        emailsSent++;
      }
    }

    await guard.complete({ totalUsers: users.length, emailsSent, skipped });

    return NextResponse.json({
      message: "Daily digest processed",
      totalUsers: users.length,
      emailsSent,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    await guard.fail(err);
    console.error("Daily digest cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
