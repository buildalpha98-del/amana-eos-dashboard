import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { signParentJwt } from "@/lib/parent-auth";
import { logger } from "@/lib/logger";

export const GET = withApiHandler(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get("token");
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const loginErrorUrl = `${baseUrl}/parent/login?error=expired`;

  if (!token) {
    return NextResponse.redirect(loginErrorUrl);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Find valid, unused, non-expired link
  const magicLink = await prisma.parentMagicLink.findUnique({
    where: { tokenHash },
  });

  if (!magicLink || magicLink.usedAt || magicLink.expiresAt < new Date()) {
    logger.warn("Parent verify: invalid or expired token", {
      tokenExists: !!magicLink,
      used: !!magicLink?.usedAt,
      expired: magicLink ? magicLink.expiresAt < new Date() : null,
    });
    return NextResponse.redirect(loginErrorUrl);
  }

  // Mark as used
  await prisma.parentMagicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  const emailLower = magicLink.email.toLowerCase().trim();

  // Look up parent data from EnrolmentSubmission
  let parentName = "Parent";
  const matchingEnrolmentIds: string[] = [];

  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { status: { not: "draft" } },
    select: {
      id: true,
      primaryParent: true,
      secondaryParent: true,
    },
  });

  for (const enrolment of enrolments) {
    const primary = enrolment.primaryParent as Record<string, unknown> | null;
    const secondary = enrolment.secondaryParent as Record<string, unknown> | null;

    if (
      primary &&
      typeof primary.email === "string" &&
      primary.email.toLowerCase().trim() === emailLower
    ) {
      matchingEnrolmentIds.push(enrolment.id);
      if (parentName === "Parent" && primary.firstName) {
        parentName = `${primary.firstName}${primary.surname ? ` ${primary.surname}` : ""}`;
      }
    } else if (
      secondary &&
      typeof secondary.email === "string" &&
      secondary.email.toLowerCase().trim() === emailLower
    ) {
      matchingEnrolmentIds.push(enrolment.id);
      if (parentName === "Parent" && secondary.firstName) {
        parentName = `${secondary.firstName}${secondary.surname ? ` ${secondary.surname}` : ""}`;
      }
    }
  }

  // Fallback name from ParentEnquiry
  if (parentName === "Parent") {
    const enquiry = await prisma.parentEnquiry.findFirst({
      where: {
        parentEmail: { equals: emailLower, mode: "insensitive" },
        deleted: false,
      },
      select: { parentName: true },
    });
    if (enquiry?.parentName) {
      parentName = enquiry.parentName;
    }
  }

  // Sign JWT
  const jwt = await signParentJwt({
    email: emailLower,
    name: parentName,
    enrolmentIds: matchingEnrolmentIds,
  });

  logger.info("Parent session created", {
    email: emailLower,
    enrolmentCount: matchingEnrolmentIds.length,
  });

  // Set cookie and redirect
  const response = NextResponse.redirect(`${baseUrl}/parent`);
  response.cookies.set("parent-session", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return response;
});
