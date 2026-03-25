import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { spotAvailableEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

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

  // Send email (fire and forget)
  if (next.parentEmail) {
    const baseUrl = process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";
    const enrolUrl = `${baseUrl}/enrol?prefill=${next.id}`;
    const serviceName = next.service?.name ?? "our service";

    const { subject, html } = spotAvailableEmail(
      next.parentName,
      serviceName,
      enrolUrl,
    );

    sendEmail({
      from: FROM_EMAIL,
      to: next.parentEmail,
      subject,
      html,
    }).catch((err) => {
      logger.error("Waitlist: failed to send spot-available email", { err, enquiryId: next.id });
    });
  }

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin", "coordinator"] });
