import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { sendParentWelcomeInvite } from "@/lib/notifications/parent-welcome";
import { logger } from "@/lib/logger";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

/**
 * POST /api/enrolments/[id]/resend-parent-invite
 *
 * Convenience endpoint for the staff enrolment detail panel: given an
 * EnrolmentSubmission id, resolve the primary parent's CentreContact (by
 * email + the enrolment's serviceId) and resend the welcome magic-link.
 *
 * If the CentreContact does not yet exist (e.g. the enrolment hasn't been
 * confirmed), this endpoint upserts one first so the resend always has
 * something to send to. This matches the user-facing promise of "resend the
 * invite" regardless of account state.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = (await context!.params!) as { id: string };

    const submission = await prisma.enrolmentSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        serviceId: true,
        primaryParent: true,
      },
    });
    if (!submission) throw ApiError.notFound("Enrolment not found");
    if (!submission.serviceId)
      throw ApiError.badRequest("Enrolment has no service assigned");

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== submission.serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const primary = submission.primaryParent as Record<string, unknown> | null;
    const email =
      typeof primary?.email === "string" ? primary.email.toLowerCase().trim() : "";
    if (!email) {
      throw ApiError.badRequest("No primary parent email on this enrolment");
    }

    const contact = await prisma.centreContact.findFirst({
      where: { email, serviceId: submission.serviceId },
      select: { id: true },
    });
    if (!contact) {
      throw ApiError.badRequest(
        "No parent account yet — confirm the enrolment first, which creates the account automatically.",
      );
    }

    const result = await sendParentWelcomeInvite({
      contactId: contact.id,
      resend: true,
    });
    if (!result.sent) {
      logger.error("Resend parent invite failed", { enrolmentId: id, contactId: contact.id });
      throw new ApiError(500, "Failed to send invite email");
    }

    return NextResponse.json({ sent: true, email: result.email });
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
