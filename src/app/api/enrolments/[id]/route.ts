import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { generateBookings } from "@/lib/booking-generator";
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/api-error";
import { upsertContactsFromSubmission } from "@/lib/enrolment-parent-contacts";
import { sendParentWelcomeInvite } from "@/lib/notifications/parent-welcome";
const patchEnrolmentSchema = z.object({
  status: z.enum(["submitted", "under_review", "processed", "rejected", "archived"], {
    error: "Invalid status. Must be one of: submitted, under_review, processed, rejected, archived",
  }).optional(),
  notes: z.string().max(5000, "Notes must be under 5000 characters").optional().nullable(),
  pdfUrl: z.string().url("pdfUrl must be a valid URL").optional().nullable(),
}).strict();

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const submission = await prisma.enrolmentSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(submission);
});

export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);

  const parsed = patchEnrolmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map(i => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status === "processed" && session) {
    updateData.processedById = session.user.id;
    updateData.processedAt = new Date();
  }

  // Wrap enrolment update + child activation + parent contact upsert in a transaction for atomicity
  const { updated, contactsToInvite } = await prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolmentSubmission.update({
      where: { id },
      data: updateData,
    });

    // When confirmed (processed), activate children + generate bookings + create parent CentreContacts
    let contactsToInvite: {
      contactId: string;
      childFirstName?: string;
    }[] = [];

    if (parsed.data.status === "processed") {
      await tx.child.updateMany({
        where: { enrolmentId: id, status: "pending" },
        data: { status: "active" },
      });

      // Auto-generate permanent bookings from bookingPrefs
      const children = await tx.child.findMany({
        where: { enrolmentId: id, status: "active" },
        select: { id: true, firstName: true, serviceId: true, bookingPrefs: true },
      });

      const allBookings = children.flatMap((child) => {
        if (!child.serviceId || !child.bookingPrefs) return [];
        return generateBookings(child.id, child.serviceId, child.bookingPrefs);
      });

      if (allBookings.length > 0) {
        const result = await tx.booking.createMany({
          data: allBookings,
          skipDuplicates: true,
        });
        logger.info("Auto-generated bookings on enrolment approval", {
          enrolmentId: id,
          childCount: children.length,
          bookingsCreated: result.count,
        });
      }

      // Upsert CentreContact rows for both parents (primary + secondary) based on
      // the submission's JSON parent blobs. Only newly-created contacts trigger
      // welcome-invite emails.
      const { primary, secondary } = await upsertContactsFromSubmission(tx, {
        id: enrolment.id,
        serviceId: enrolment.serviceId,
        primaryParent: enrolment.primaryParent,
        secondaryParent: enrolment.secondaryParent,
      });

      const firstChildName = children[0]?.firstName;
      if (primary?.created) {
        contactsToInvite.push({ contactId: primary.id, childFirstName: firstChildName });
      }
      if (secondary?.created) {
        contactsToInvite.push({ contactId: secondary.id, childFirstName: firstChildName });
      }

      logger.info("Enrolment processed — parent contacts upserted", {
        enrolmentId: id,
        primaryContactId: primary?.id,
        primaryCreated: primary?.created,
        secondaryContactId: secondary?.id,
        secondaryCreated: secondary?.created,
      });
    }

    return { updated: enrolment, contactsToInvite };
  });

  // Fire-and-forget welcome emails for newly-created parent contacts (post-transaction
  // so a slow email provider can't block the DB write)
  for (const invite of contactsToInvite) {
    sendParentWelcomeInvite(invite).catch((err) =>
      logger.error("Welcome invite failed", { contactId: invite.contactId, err }),
    );
  }

  return NextResponse.json(updated);
});
