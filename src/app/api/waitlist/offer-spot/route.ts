import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { spotAvailableEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { siteUrl } from "@/lib/site-url";

const offerSpotSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
});

/**
 * POST /api/waitlist/offer-spot — offer the next spot to the first waitlisted family
 */
export const POST = withApiAuth(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const { serviceId } = offerSpotSchema.parse(body);

  // Atomic find-and-offer to prevent double-offer race condition
  const result = await prisma.$transaction(async (tx) => {
    const next = await tx.parentEnquiry.findFirst({
      where: {
        stage: "waitlisted",
        waitlistServiceId: serviceId,
        waitlistOfferedAt: null,
        deleted: false,
      },
      orderBy: { waitlistPosition: "asc" },
      include: {
        service: { select: { id: true, name: true } },
      },
    });

    if (!next) return null;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours

    // Conditional update: only succeeds if still not offered (prevents double-offer)
    const updated = await tx.parentEnquiry.update({
      where: { id: next.id, waitlistOfferedAt: null },
      data: {
        waitlistOfferedAt: now,
        waitlistExpiresAt: expiresAt,
      },
      include: {
        service: { select: { id: true, name: true } },
      },
    });

    return updated;
  });

  if (!result) {
    return NextResponse.json(
      { error: "No families on the waitlist for this service" },
      { status: 404 },
    );
  }

  const next = result;
  const updated = result;

  /**
   * Whether the family was actually told.
   *
   * Returned to the caller so the staff member who pressed "offer this
   * spot" learns that the offer went out — or didn't. Offering a place
   * and silently failing to tell anyone is the worst outcome here: the
   * clock starts running on an offer the family never saw.
   */
  let emailed = false;

  if (next.parentEmail) {
    const baseUrl = siteUrl();
    /**
     * `/parent/signup?enquiry=`, carrying the enquiry through.
     *
     * This was `/enrol?prefill=`, which was broken twice over:
     * `/enrol` is a bare redirect and a redirect drops the query
     * string, and signup only read `?ref=` anyway. So every family
     * offered a spot bounced to a blank form with nothing carried
     * over — after being told their place was ready.
     */
    const enrolUrl = `${baseUrl}/parent/signup?enquiry=${next.id}`;
    const serviceName = next.service?.name ?? "our service";

    const { subject, html } = await spotAvailableEmail(
      next.parentName,
      serviceName,
      enrolUrl,
    );

    /*
     * Awaited, not fired and forgotten. This was a bare promise, which
     * on serverless dies when the response returns — so the mail
     * telling a family their place is ready was a race against the
     * runtime freezing, and the `.catch()` never ran either.
     *
     * A few hundred milliseconds on a staff button press is a fair
     * price for the staff member finding out it didn't send.
     */
    try {
      // `sendResult`, not `result` — the enquiry above already owns
      // that name.
      const sendResult = await sendEmail({
        from: FROM_EMAIL,
        to: next.parentEmail,
        subject,
        html,
      });
      emailed = sendResult.sent.length > 0;
      if (sendResult.failed) {
        logger.error("Waitlist: spot-available email rejected by provider", {
          enquiryId: next.id,
          error: sendResult.failed.message,
        });
      } else if (sendResult.suppressed.length > 0) {
        logger.error("Waitlist: spot-available email blocked by suppression", {
          enquiryId: next.id,
        });
      }
    } catch (err) {
      logger.error("Waitlist: failed to send spot-available email", {
        err,
        enquiryId: next.id,
      });
    }
  }

  return NextResponse.json({ ...updated, emailed });
}, { roles: ["owner", "head_office", "admin", "member"] });
