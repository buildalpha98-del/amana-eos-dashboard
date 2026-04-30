import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { sendParentWelcomeInvite } from "@/lib/notifications/parent-welcome";

/**
 * POST /api/centre-contacts/[id]/resend-invite
 *
 * Staff-only. Generates a fresh magic-link and re-sends the parent welcome
 * email to the CentreContact. Used when the original invite email was missed,
 * expired, or went to spam.
 *
 * Org-wide roles (owner/head_office) can resend for any contact; service-scoped
 * roles must match the contact's serviceId.
 */
const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = (await context!.params!) as { id: string };

    const contact = await prisma.centreContact.findUnique({
      where: { id },
      select: { id: true, email: true, serviceId: true },
    });
    if (!contact) throw ApiError.notFound("Contact not found");

    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== contact.serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const result = await sendParentWelcomeInvite({
      contactId: contact.id,
      resend: true,
    });

    if (!result.sent) {
      throw new ApiError(500, "Failed to send invite email");
    }

    return NextResponse.json({ sent: true, email: result.email });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
