/**
 * Mute (or unmute) ALL of a user's outbound notifications, by email.
 *
 * "Mute" = the user receives no external pings:
 *   - Email: their address goes on the EmailSuppression list. The central
 *     sendEmail() already skips suppressed recipients, so EVERY notification
 *     email stops (assignments, digests, nudges, announcements, …).
 *   - Push: their PushSubscription rows are deleted (no web-push).
 *   - notificationPrefs set all-off, for the cron/digest paths that read them.
 *
 * In-app notifications (the bell) are LEFT INTACT — the user still sees
 * updates when they log in. That's the "only logs in to see updates" model.
 *
 * Password-reset / login emails are unaffected: those bypass sendEmail() and
 * go straight through Resend (see api/auth/forgot-password), so a muted user
 * can still recover account access.
 *
 * Usage:
 *   npx tsx scripts/mute-user-notifications.ts <email> [--unmute] [--dry]
 *
 * --unmute removes the manual suppression and resets prefs to the user's
 * role defaults. (Push subscriptions are not restored — the user re-enables
 * push from their browser.) Genuine bounce/complaint suppressions are never
 * touched — only reason="manual_mute" rows are added/removed.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { getDefaultNotificationPrefs } from "../src/lib/notification-defaults";

const prisma = new PrismaClient();

const ALL_OFF = {
  overdueTodos: false,
  newAssignments: false,
  complianceAlerts: false,
  announcements: false,
  leaveUpdates: false,
  meetingReminders: false,
  rockUpdates: false,
  emailNotifications: false,
  emailDigest: false,
};

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const unmute = args.includes("--unmute");
  const email = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();

  if (!email) {
    console.error("Usage: npx tsx scripts/mute-user-notifications.ts <email> [--unmute] [--dry]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const pushCount = await prisma.pushSubscription.count({ where: { userId: user.id } });
  const suppressed = !!(await prisma.emailSuppression.findUnique({ where: { email } }));

  console.log(`User: ${user.name} <${user.email}> (role=${user.role})`);
  console.log(`Action: ${unmute ? "UNMUTE" : "MUTE"}`);
  console.log(`  email suppressed : ${suppressed} → ${unmute ? "false" : "true"}`);
  console.log(`  push subscriptions: ${pushCount}${unmute ? "" : " → 0"}`);
  console.log(`  notificationPrefs : → ${unmute ? "role defaults" : "all off"}`);

  if (dry) {
    console.log("--dry: no changes written.");
    return;
  }

  if (unmute) {
    // Only lift OUR manual mute — never un-suppress a real bounce/complaint.
    await prisma.emailSuppression.deleteMany({ where: { email, reason: "manual_mute" } });
    await prisma.user.update({
      where: { id: user.id },
      data: { notificationPrefs: getDefaultNotificationPrefs(user.role) as Prisma.InputJsonValue },
    });
    console.log(`✓ ${email} un-muted — manual suppression removed, prefs reset to ${user.role} defaults.`);
  } else {
    await prisma.emailSuppression.upsert({
      where: { email },
      update: {}, // if already suppressed (e.g. a bounce), leave it — still muted
      create: { email, reason: "manual_mute", source: "mute-user-notifications script" },
    });
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({
      where: { id: user.id },
      data: { notificationPrefs: ALL_OFF as Prisma.InputJsonValue },
    });
    console.log(`✓ ${email} muted — no notification emails, no push. In-app bell unchanged (updates visible on login).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
