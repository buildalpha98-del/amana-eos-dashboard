/**
 * POST /api/enrolments/[id]/assign-service
 *
 * Attach an enrolment — and its children, and the family's billing
 * contacts — to a service.
 *
 * Needed because an enrolment can legitimately arrive without one: the
 * school a family typed didn't resolve to a centre, or resolved
 * ambiguously (see src/lib/school-service-match.ts, which refuses to
 * guess between campuses). It also repairs enrolments submitted before
 * service resolution existed at all, which had serviceId null and were
 * therefore invisible in every per-service view.
 *
 * The three links move TOGETHER on purpose. A child assigned to a centre
 * whose family has no CentreContact there can be rostered but not
 * invoiced — a half-assigned family is harder to notice, and worse, than
 * an unassigned one.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { upsertContactsFromSubmission } from "@/lib/enrolment-parent-contacts";
import { logAmbassadorEnrolmentForChild } from "@/lib/ambassadors/log-enrolment";
import { generateBookings } from "@/lib/booking-generator";
import { isPlacementReason } from "@/lib/placement-reason";
import { stampRequiredRoomIds } from "@/lib/room-resolver";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  serviceId: z.string().min(1),
  /**
   * Limit the assignment to specific children. Omitted = all of them.
   * Siblings genuinely attend different campuses, so assigning the whole
   * enrolment isn't always right.
   */
  childIds: z.array(z.string().min(1)).optional(),
  /** Why they attend this centre — e.g. Holiday Quest. Null clears it. */
  placementReason: z.string().max(40).nullable().optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { serviceId, childIds } = parsed.data;
    const reasonGiven = parsed.data.placementReason !== undefined;
    const placementReason =
      parsed.data.placementReason && isPlacementReason(parsed.data.placementReason)
        ? parsed.data.placementReason
        : null;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true, status: true },
    });
    if (!service) throw ApiError.notFound("Service not found");
    if (service.status !== "active") {
      // Assigning a family to a closed centre produces a roll nobody
      // reads and invoices nobody sends.
      throw ApiError.badRequest(`${service.name} isn't an active service.`);
    }

    const enrolment = await prisma.enrolmentSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        serviceId: true,
        status: true,
        primaryParent: true,
        secondaryParent: true,
        childRecords: {
          select: { id: true, serviceId: true, bookingPrefs: true },
        },
      },
    });
    if (!enrolment) throw ApiError.notFound("Enrolment not found");

    const targetChildren = childIds
      ? enrolment.childRecords.filter((c) => childIds.includes(c.id))
      : enrolment.childRecords;

    if (childIds && targetChildren.length !== childIds.length) {
      throw ApiError.badRequest(
        "Some of those children don't belong to this enrolment.",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Only set the enrolment's own service when the whole enrolment is
      // moving. With a subset, children legitimately differ and stamping
      // one service on the submission would misrepresent the rest.
      const wholeEnrolment = targetChildren.length === enrolment.childRecords.length;
      if (wholeEnrolment) {
        await tx.enrolmentSubmission.update({
          where: { id },
          data: { serviceId },
        });
      }

      if (targetChildren.length > 0) {
        await tx.child.updateMany({
          where: { id: { in: targetChildren.map((c) => c.id) } },
          // The reason belongs to the CHILD's placement, not the
          // submission — siblings at the same centre can be there for
          // different reasons.
          data: { serviceId, ...(reasonGiven ? { placementReason } : {}) },
        });
      }

      // Billing contacts for the destination centre. Without these the
      // family exists at the service but can't be invoiced there.
      const contacts = await upsertContactsFromSubmission(tx, {
        id: enrolment.id,
        serviceId,
        primaryParent: enrolment.primaryParent,
        secondaryParent: enrolment.secondaryParent,
      });

      // Bookings are normally generated at approval — but that step skips
      // any child with no serviceId, so an enrolment confirmed before it
      // was placed has none. Fill them in now, or the family is enrolled
      // at a centre with an empty roll and nothing to invoice.
      let bookingsCreated = 0;
      if (enrolment.status === "processed" && targetChildren.length > 0) {
        const rows = targetChildren.flatMap((c) =>
          generateBookings(c.id, serviceId, c.bookingPrefs),
        );
        if (rows.length > 0) {
          const res = await tx.booking.createMany({
            // Stage 1 dual key — see room-resolver.ts.
            data: await stampRequiredRoomIds(rows),
            skipDuplicates: true,
          });
          bookingsCreated = res.count;
        }
      }

      return { wholeEnrolment, contacts, bookingsCreated };
    });

    logger.info("Enrolment assigned to service", {
      enrolmentId: id,
      serviceId,
      serviceName: service.name,
      children: targetChildren.length,
      wholeEnrolment: result.wholeEnrolment,
      bookingsCreated: result.bookingsCreated,
      userId: session?.user?.id,
    });

    // Ambassadors: a pilot-window child whose school didn't auto-match at
    // submit time gains its serviceId here — log it now (the window check
    // inside uses the ORIGINAL submission date). Never throws.
    for (const c of targetChildren) {
      await logAmbassadorEnrolmentForChild(c.id);
    }

    return NextResponse.json({
      ok: true,
      serviceId,
      serviceName: service.name,
      childrenAssigned: targetChildren.length,
      bookingsCreated: result.bookingsCreated,
      primaryContactId: result.contacts.primary?.id ?? null,
      secondaryContactId: result.contacts.secondary?.id ?? null,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
