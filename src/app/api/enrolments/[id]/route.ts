import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { generateBookings } from "@/lib/booking-generator";
import { logger } from "@/lib/logger";
import { syncParentJourney } from "@/lib/parent-journey";
import { sendEmail } from "@/lib/email";
import { reissueVerification } from "@/lib/parent-account";
import { enrolmentApprovedEmail } from "@/lib/email-templates/parent-account";
import { parseJsonBody } from "@/lib/api-error";
import { upsertContactsFromSubmission } from "@/lib/enrolment-parent-contacts";
import { sendParentWelcomeInvite } from "@/lib/notifications/parent-welcome";
import { stampRequiredRoomIds } from "@/lib/room-resolver";
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
    include: {
      // The Child ROWS, not the submission's `children` JSON blob. Assigning
      // or copying an enrolment to a service acts on these rows, and the
      // JSON has no ids to act on.
      childRecords: {
        select: { id: true, firstName: true, surname: true, serviceId: true, status: true },
        orderBy: { firstName: "asc" },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // EnrolmentSubmission holds serviceId as a plain column with no relation,
  // so the name is a second lookup rather than an include.
  const service = submission.serviceId
    ? await prisma.service.findUnique({
        where: { id: submission.serviceId },
        select: { id: true, name: true },
      })
    : null;

  return NextResponse.json({ ...submission, service });
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
    const contactsToInvite: {
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
          // Stage 1 dual key — see room-resolver.ts.
          data: await stampRequiredRoomIds(allBookings),
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

  // ── "Enrolment confirmed" + the email-verification ask ────────────────
  // Verification lives HERE rather than at sign-up (2026-07-31): families
  // now go straight from sign-up into the form, and are asked to confirm
  // their address only once staff have approved them.
  //
  // Outside the transaction and fully swallowed — a mail failure must
  // never roll back an approval that already activated the children and
  // generated their bookings.
  if (parsed.data.status === "processed") {
    void (async () => {
      try {
        const primary = updated.primaryParent as {
          email?: string;
          firstName?: string;
        } | null;
        const email = primary?.email?.trim();
        if (!email) return;

        const kids = await prisma.child.findMany({
          where: { enrolmentId: id },
          select: { firstName: true },
        });

        // null when the address is already verified — then it's simply a
        // confirmation email with nothing to action.
        const reissued = await reissueVerification(email);
        const base = process.env.NEXTAUTH_URL ?? "https://amanaoshc.company";

        const { subject, html } = await enrolmentApprovedEmail({
          name: primary?.firstName?.trim() || "there",
          childNames: kids.map((c) => c.firstName).filter(Boolean),
          verifyLink: reissued
            ? `${base}/parent/confirm?token=${reissued.token}`
            : null,
        });
        await sendEmail({ to: email, subject, html });
      } catch (err) {
        logger.error("Enrolment approval email failed", { enrolmentId: id, err });
      }
    })();

    // ── Hand the family to the onboarding flow ───────────────────────
    // The first-session sequence (reminder the day before, day-1 and
    // day-3 check-ins, week-2 feedback, referral invite, NPS) is anchored
    // on the date they actually start, which is the booking preference
    // they gave in the form. Approval is the first moment that date is
    // real, so it's the right place to hand over.
    void (async () => {
      try {
        const primary = updated.primaryParent as {
          email?: string;
          firstName?: string;
          surname?: string;
        } | null;
        if (!primary?.email || !updated.serviceId) return;

        const kids = await prisma.child.findMany({
          where: { enrolmentId: id },
          select: { firstName: true, surname: true, bookingPrefs: true },
        });
        const firstSessionDate = earliestStartDate(kids);
        const kid = kids[0];

        await syncParentJourney({
          email: primary.email,
          serviceId: updated.serviceId,
          stage: firstSessionDate ? "first_session" : "enrolled",
          parentName:
            [primary.firstName, primary.surname].filter(Boolean).join(" ") ||
            null,
          childName: kid
            ? [kid.firstName, kid.surname].filter(Boolean).join(" ")
            : null,
          firstSessionDate,
        });
      } catch (err) {
        logger.error("Could not start onboarding flow", { enrolmentId: id, err });
      }
    })();
  }

  return NextResponse.json(updated);
});

/**
 * The soonest start date across a family's children.
 *
 * Siblings can start on different days; the onboarding run should begin
 * with the first child through the door, not an arbitrary one.
 */
function earliestStartDate(
  kids: { bookingPrefs: unknown }[],
): Date | null {
  const dates = kids
    .map((k) => {
      const prefs = k.bookingPrefs as { startDate?: string } | null;
      if (!prefs?.startDate) return null;
      const d = new Date(prefs.startDate);
      return Number.isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}
