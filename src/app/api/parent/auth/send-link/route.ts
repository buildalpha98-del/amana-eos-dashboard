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

  // The enquiry is consulted only for a friendly NAME now — it used to
  // also narrow the enrolment search by centre, which is what made this
  // work for some parents and not others.
  let parentName: string | null = null;
  const enquiry = await prisma.parentEnquiry.findFirst({
    where: {
      parentEmail: { equals: emailLower, mode: "insensitive" },
      deleted: false,
    },
    select: { parentName: true },
  });
  if (enquiry?.parentName) parentName = enquiry.parentName;

  // Look up the parent by email.
  //
  // 2026-08-06 — REWRITTEN. This used to fetch enrolments with
  // `take: 100` and scan them in memory for a matching email, because
  // the address lives inside the primaryParent JSON rather than in a
  // column. With 1,000+ enrolments across 11 centres, any parent whose
  // row fell outside that arbitrary 100 was reported as "unknown
  // email": no link sent, but the page still said one had been. There
  // was no `orderBy` either, so the same parent could work once and
  // fail the next time.
  //
  // Postgres can read inside JSON, so this asks the database the exact
  // question instead of guessing at a window. LOWER() on both sides
  // because addresses were captured with whatever case a parent typed.
  const matches = await prisma.$queryRaw<
    Array<{ id: string; first_name: string | null; surname: string | null }>
  >`
    SELECT
      id,
      CASE
        WHEN LOWER("primaryParent"->>'email') = ${emailLower}
          THEN "primaryParent"->>'firstName'
        ELSE "secondaryParent"->>'firstName'
      END AS first_name,
      CASE
        WHEN LOWER("primaryParent"->>'email') = ${emailLower}
          THEN "primaryParent"->>'surname'
        ELSE "secondaryParent"->>'surname'
      END AS surname
    FROM "EnrolmentSubmission"
    WHERE status <> 'draft'
      AND (
        LOWER("primaryParent"->>'email') = ${emailLower}
        OR LOWER("secondaryParent"->>'email') = ${emailLower}
      )
    LIMIT 50
  `;

  const matchingEnrolmentIds = matches.map((m) => m.id);
  if (!parentName) {
    const named = matches.find((m) => m.first_name);
    if (named?.first_name) {
      parentName = `${named.first_name}${named.surname ? ` ${named.surname}` : ""}`;
    }
  }

  // No match anywhere: return success without sending, so the page
  // can't be used to discover which addresses are registered.
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
  const { subject, html } = await parentMagicLinkEmail(displayName, loginUrl);

  try {
    const result = await sendEmail({ to: emailLower, subject, html });
    if (result.suppressed.length > 0) {
      // A parent on the suppression list — one bounce or spam complaint,
      // months ago — can never receive a login link again, and until now
      // nothing anywhere said so. The parent-facing message stays vague
      // on purpose; this is how STAFF find out.
      logger.error("Parent magic link BLOCKED by suppression list", {
        email: emailLower,
        action:
          "Remove them from email suppression, or sign them in another way.",
      });
    } else {
      logger.info("Parent magic link sent", { email: emailLower });
    }
  } catch (err) {
    logger.error("Failed to send parent magic link email", { email: emailLower, err });
    // Still return success to avoid leaking info
  }

  return successResponse;
});
