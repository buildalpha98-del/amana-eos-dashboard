import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { spotExpiredEmail, spotAvailableEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/waitlist-expiry — expire stale waitlist offers and auto-offer to next family
 *
 * Runs every hour. Finds waitlisted enquiries where the 48-hour offer window has passed,
 * clears the offer, moves to end of waitlist, sends expiry email, and auto-offers to next.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const authResult = verifyCronSecret(req);
  if (authResult) return authResult.error;

  const now = new Date();

  // Find expired offers
  const expired = await prisma.parentEnquiry.findMany({
    where: {
      stage: "waitlisted",
      waitlistExpiresAt: { not: null, lt: now },
      deleted: false,
    },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  if (expired.length === 0) {
    return NextResponse.json({ expired: 0, offered: 0 });
  }

  let expiredCount = 0;
  let offeredCount = 0;

  for (const enquiry of expired) {
    const serviceId = enquiry.waitlistServiceId;
    if (!serviceId) continue;

    // Find current max position for this service to move expired to end
    const maxResult = await prisma.parentEnquiry.aggregate({
      where: { waitlistServiceId: serviceId, stage: "waitlisted" },
      _max: { waitlistPosition: true },
    });
    const endPosition = (maxResult._max.waitlistPosition ?? 0) + 1;

    // Clear offer and move to end of waitlist
    await prisma.parentEnquiry.update({
      where: { id: enquiry.id },
      data: {
        waitlistOfferedAt: null,
        waitlistExpiresAt: null,
        waitlistPosition: endPosition,
      },
    });
    expiredCount++;

    // Send expired email (fire-and-forget)
    const serviceName = enquiry.service?.name ?? "our service";
    if (enquiry.parentEmail) {
      const { subject, html } = spotExpiredEmail(enquiry.parentName, serviceName);
      sendEmail({ from: FROM_EMAIL, to: enquiry.parentEmail, subject, html }).catch((err) => {
        logger.error("Waitlist expiry: failed to send expired email", { err, enquiryId: enquiry.id });
      });
    }

    // Auto-offer to next person in line for this service
    const next = await prisma.parentEnquiry.findFirst({
      where: {
        stage: "waitlisted",
        waitlistServiceId: serviceId,
        waitlistOfferedAt: null,
        deleted: false,
        id: { not: enquiry.id }, // exclude the one we just expired
      },
      orderBy: { waitlistPosition: "asc" },
      include: {
        service: { select: { id: true, name: true } },
      },
    });

    if (next) {
      const offerExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      await prisma.parentEnquiry.update({
        where: { id: next.id },
        data: {
          waitlistOfferedAt: now,
          waitlistExpiresAt: offerExpiresAt,
        },
      });
      offeredCount++;

      // Send spot-available email to next family (fire-and-forget)
      if (next.parentEmail) {
        const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";
        const enrolUrl = `${baseUrl}/enrol?prefill=${next.id}`;
        const nextServiceName = next.service?.name ?? "our service";
        const { subject, html } = spotAvailableEmail(next.parentName, nextServiceName, enrolUrl);
        sendEmail({ from: FROM_EMAIL, to: next.parentEmail, subject, html }).catch((err) => {
          logger.error("Waitlist expiry: failed to send offer email", { err, enquiryId: next.id });
        });
      }
    }
  }

  logger.info("Waitlist expiry cron completed", { expiredCount, offeredCount });
  return NextResponse.json({ expired: expiredCount, offered: offeredCount });
});
