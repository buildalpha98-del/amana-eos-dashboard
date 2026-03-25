import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { parentMagicLinkEmail } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

const sendLinkSchema = z.object({
  email: z.string().email(),
});

export const POST = withApiHandler(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = sendLinkSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid email", parsed.error.flatten());
  }

  const { email } = parsed.data;
  const emailLower = email.toLowerCase().trim();

  // Rate limit: 3 per hour per email
  const rl = await checkRateLimit(`parent-magic:${emailLower}`, 3, 60 * 60 * 1000);
  if (rl.limited) {
    throw new ApiError(429, "Too many login requests. Please try again later.");
  }

  // Always return success to avoid leaking email existence
  const successResponse = NextResponse.json({
    success: true,
    message: "If an account exists, a login link has been sent.",
  });

  // Look up email in EnrolmentSubmission (primaryParent or secondaryParent)
  // or ParentEnquiry
  let parentName: string | null = null;

  // Check EnrolmentSubmission — primaryParent.email or secondaryParent.email
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      status: { not: "draft" },
    },
    select: {
      id: true,
      primaryParent: true,
      secondaryParent: true,
    },
  });

  const matchingEnrolmentIds: string[] = [];

  for (const enrolment of enrolments) {
    const primary = enrolment.primaryParent as Record<string, unknown> | null;
    const secondary = enrolment.secondaryParent as Record<string, unknown> | null;

    if (
      primary &&
      typeof primary.email === "string" &&
      primary.email.toLowerCase().trim() === emailLower
    ) {
      matchingEnrolmentIds.push(enrolment.id);
      if (!parentName && primary.firstName) {
        parentName = `${primary.firstName}${primary.surname ? ` ${primary.surname}` : ""}`;
      }
    } else if (
      secondary &&
      typeof secondary.email === "string" &&
      secondary.email.toLowerCase().trim() === emailLower
    ) {
      matchingEnrolmentIds.push(enrolment.id);
      if (!parentName && secondary.firstName) {
        parentName = `${secondary.firstName}${secondary.surname ? ` ${secondary.surname}` : ""}`;
      }
    }
  }

  // Also check ParentEnquiry
  if (!parentName) {
    const enquiry = await prisma.parentEnquiry.findFirst({
      where: {
        parentEmail: { equals: emailLower, mode: "insensitive" },
        deleted: false,
      },
      select: { parentName: true },
    });
    if (enquiry) {
      parentName = enquiry.parentName;
    }
  }

  // If no matching parent found, return success without sending (don't leak)
  if (!parentName && matchingEnrolmentIds.length === 0) {
    logger.info("Parent magic link requested for unknown email", { email: emailLower });
    return successResponse;
  }

  const displayName = parentName || "Parent";

  // Generate token
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.parentMagicLink.create({
    data: {
      email: emailLower,
      tokenHash,
      expiresAt,
    },
  });

  // Send email
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginUrl = `${baseUrl}/api/parent/auth/verify?token=${token}`;
  const { subject, html } = parentMagicLinkEmail(displayName, loginUrl);

  try {
    await sendEmail({ to: emailLower, subject, html });
    logger.info("Parent magic link sent", { email: emailLower });
  } catch (err) {
    logger.error("Failed to send parent magic link email", { email: emailLower, err });
    // Still return success to avoid leaking info
  }

  return successResponse;
});
