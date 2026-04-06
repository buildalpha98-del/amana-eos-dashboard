import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { baseLayout } from "@/lib/email-templates/base";
import { logger } from "@/lib/logger";

const PORTAL_URL = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

function verifyCronSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * GET /api/cron/unactioned-bookings
 *
 * Runs daily at 9am AEST (23:00 UTC previous day).
 * Sends a summary email to coordinators about booking requests
 * that have been pending for more than 24 hours.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const unactioned = await prisma.booking.findMany({
    where: {
      status: "requested",
      createdAt: { lt: twentyFourHoursAgo },
    },
    include: {
      child: { select: { firstName: true, surname: true } },
      service: { select: { id: true, name: true, managerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (unactioned.length === 0) {
    return NextResponse.json({ message: "No unactioned bookings", sent: 0 });
  }

  // Group by serviceId
  const byService = new Map<string, typeof unactioned>();
  for (const booking of unactioned) {
    const key = booking.serviceId;
    if (!byService.has(key)) byService.set(key, []);
    byService.get(key)!.push(booking);
  }

  let sent = 0;

  for (const [serviceId, bookings] of byService) {
    const serviceName = bookings[0].service.name;

    // Find coordinator email
    const coordinator = await prisma.user.findFirst({
      where: {
        OR: [
          { id: bookings[0].service.managerId ?? "" },
          { serviceId, role: "coordinator", active: true },
        ],
      },
      select: { email: true, name: true },
    });

    if (!coordinator) {
      logger.warn("No coordinator for unactioned bookings alert", { serviceId });
      continue;
    }

    const bookingRows = bookings
      .map((b) => {
        const date = b.date.toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "Australia/Sydney",
        });
        const session = b.sessionType === "bsc" ? "BSC" : b.sessionType === "asc" ? "ASC" : "VC";
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${b.child.firstName} ${b.child.surname}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${date}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${session}</td>
        </tr>`;
      })
      .join("");

    await sendEmail({
      from: FROM_EMAIL,
      to: coordinator.email,
      subject: `Unactioned booking requests — ${serviceName}`,
      html: baseLayout(`
        <h2 style="color:#004E64;margin:0 0 16px;">Unactioned Booking Requests</h2>
        <p style="margin:0 0 12px;color:#374151;font-size:15px;">
          Hi ${coordinator.name},
        </p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;">
          The following <strong>${bookings.length}</strong> booking request${bookings.length > 1 ? "s" : ""} at <strong>${serviceName}</strong>
          ${bookings.length > 1 ? "have" : "has"} been waiting for more than 24 hours:
        </p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f8f5f2;">
              <th style="padding:8px 12px;text-align:left;font-size:13px;color:#7c7c8a;">Child</th>
              <th style="padding:8px 12px;text-align:left;font-size:13px;color:#7c7c8a;">Date</th>
              <th style="padding:8px 12px;text-align:left;font-size:13px;color:#7c7c8a;">Session</th>
            </tr>
          </thead>
          <tbody>${bookingRows}</tbody>
        </table>
        <p style="margin:16px 0 0;">
          <a href="${PORTAL_URL}/bookings"
             style="display:inline-block;padding:12px 32px;background-color:#004E64;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">
            Review Requests
          </a>
        </p>
      `),
    });

    sent++;
  }

  logger.info("Unactioned bookings cron complete", {
    totalUnactioned: unactioned.length,
    servicesNotified: sent,
  });

  return NextResponse.json({
    message: "Unactioned booking alerts sent",
    totalUnactioned: unactioned.length,
    servicesNotified: sent,
  });
}
