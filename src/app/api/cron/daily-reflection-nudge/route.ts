import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { sendNotificationEmail } from "@/lib/notifications/sendEmail";
import { isWebPushConfigured, sendPush } from "@/lib/push/webPush";

const BRAND_COLOR = "#004E64";

/** UTC instant of today's midnight in Australia/Sydney. */
function sydneyDayStartUtc(now = new Date()): Date {
  const syd = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  const offsetMs = syd.getTime() - now.getTime();
  const sydMidnight = new Date(syd);
  sydMidnight.setHours(0, 0, 0, 0);
  return new Date(sydMidnight.getTime() - offsetMs);
}

function nudgeHtml(recipientName: string, serviceName: string, link: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<p>Hi ${recipientName},</p>
<p>No daily reflection has been logged for <strong>${serviceName}</strong> yet today. A quick note about how the day went keeps your SAT/QIP evidence current and gives families a window into the day.</p>
<p style="margin:24px 0;"><a href="${link}" style="background:${BRAND_COLOR};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Write today's reflection</a></p>
<p style="color:#6b7280;font-size:13px;">Takes about two minutes — tag the children involved and it becomes their portfolio observation too.</p>
</div>`;
}

/**
 * GET /api/cron/daily-reflection-nudge
 *
 * Weekdays 07:00 UTC (~5pm AEST) — for every active service with no daily
 * reflection logged today (Sydney day), email + push the service's educators
 * and coordinator.
 *
 * Auth: Bearer CRON_SECRET
 */
export const GET = withApiHandler(async (req) => {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await acquireCronLock("daily-reflection-nudge", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const dayStart = sydneyDayStartUtc();
    const baseUrl = process.env.NEXTAUTH_URL || "https://amanaoshc.company";

    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
    });

    let servicesMissing = 0;
    let emailsSent = 0;
    let pushesSent = 0;

    for (const service of services) {
      const count = await prisma.staffReflection.count({
        where: {
          serviceId: service.id,
          type: "daily",
          createdAt: { gte: dayStart },
        },
      });
      if (count > 0) continue;
      servicesMissing++;

      const recipients = await prisma.user.findMany({
        where: {
          serviceId: service.id,
          active: true,
          role: { in: ["staff", "member"] },
        },
        select: { id: true, name: true, email: true },
      });
      if (recipients.length === 0) continue;

      const link = `${baseUrl}/services/${service.id}?tab=compliance&sub=reflections`;

      for (const user of recipients) {
        try {
          await sendNotificationEmail({
            to: user.email,
            toName: user.name ?? undefined,
            subject: `Daily reflection reminder — ${service.name}`,
            html: nudgeHtml(user.name || "there", service.name, link),
            type: "daily_reflection_nudge",
            relatedId: service.id,
            relatedType: "Service",
          });
          emailsSent++;
        } catch (err) {
          logger.warn("Daily reflection nudge email failed", {
            userId: user.id,
            serviceId: service.id,
            err,
          });
        }
      }

      if (isWebPushConfigured()) {
        const subs = await prisma.pushSubscription.findMany({
          where: { userId: { in: recipients.map((u) => u.id) } },
          select: { endpoint: true, p256dh: true, auth: true },
        });
        for (const sub of subs) {
          try {
            await sendPush(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              {
                title: "Daily reflection reminder",
                body: `No daily reflection logged for ${service.name} yet today.`,
                url: link,
              },
            );
            pushesSent++;
          } catch (err) {
            logger.warn("Daily reflection nudge push failed", {
              serviceId: service.id,
              err,
            });
          }
        }
      }
    }

    const summary = {
      servicesChecked: services.length,
      servicesMissing,
      emailsSent,
      pushesSent,
    };
    logger.info("Daily reflection nudge completed", summary);
    await guard.complete(summary);
    return NextResponse.json(summary);
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
