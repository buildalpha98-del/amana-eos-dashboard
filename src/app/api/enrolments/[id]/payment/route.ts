import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { decryptField } from "@/lib/field-encryption";
import { ApiError } from "@/lib/api-error";

/**
 * POST /api/enrolments/[id]/payment
 * Decrypts and returns the full payment details for OWNA porting.
 * Restricted to owner and head_office roles.
 */
export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const { id } = await context!.params!;

    const submission = await prisma.enrolmentSubmission.findUnique({
      where: { id },
      select: { paymentDetails: true, paymentMethod: true },
    });

    if (!submission) {
      throw ApiError.notFound("Enrolment submission not found");
    }

    const details = submission.paymentDetails as Record<string, unknown> | null;
    if (!details?.raw || typeof details.raw !== "string") {
      throw ApiError.notFound("No encrypted payment details available for this submission");
    }

    const decrypted = decryptField(details.raw as string);
    const parsed = JSON.parse(decrypted);

    return NextResponse.json({
      method: submission.paymentMethod,
      ...parsed,
    });
  },
  { roles: ["owner", "head_office"] },
);
