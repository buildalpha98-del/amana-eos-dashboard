/**
 * POST /api/enrolments/[id]/duplicate
 *
 * Copy an existing enrolment to another service.
 *
 * For a family already enrolled with us who needs a place at a second
 * centre — a sibling at a different campus, or a child moving. Making
 * them refill a five-step form to restate details we already hold is how
 * you lose an existing family, and it produces a second record that
 * drifts from the first.
 *
 * The copy is a REAL submission at the new service, not a link: the two
 * enrolments have different bookings, invoices and rolls, and a shared
 * row couldn't represent that.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { upsertContactsFromSubmission } from "@/lib/enrolment-parent-contacts";
import { isPlacementReason } from "@/lib/placement-reason";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  serviceId: z.string().min(1),
  /** Which children go to the new service. Omitted = all of them. */
  childIds: z.array(z.string().min(1)).optional(),
  /**
   * Move rather than copy: the children leave the original enrolment's
   * service instead of attending both. A child at one campus on Monday
   * and another on Tuesday is real, so this is a choice, not a default.
   */
  move: z.boolean().default(false),
  /**
   * Why they're going to the second centre — Holiday Quest, a sibling's
   * campus, and so on. Without it the copy reads as a duplicate record
   * rather than a deliberate second placement.
   */
  placementReason: z.string().max(40).nullable().optional(),
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const { serviceId, childIds, move } = parsed.data;
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
      throw ApiError.badRequest(`${service.name} isn't an active service.`);
    }

    const source = await prisma.enrolmentSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        serviceId: true,
        primaryParent: true,
        secondaryParent: true,
        children: true,
        emergencyContacts: true,
        authorisedPickup: true,
        consents: true,
        paymentMethod: true,
        paymentDetails: true,
        referralSource: true,
        signature: true,
        termsAccepted: true,
        privacyAccepted: true,
        debitAgreement: true,
        courtOrders: true,
        courtOrderFiles: true,
        medicalFiles: true,
        documentUploads: true,
        childRecords: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            dob: true,
            gender: true,
            address: true,
            culturalBackground: true,
            schoolName: true,
            yearLevel: true,
            crn: true,
            medical: true,
            dietary: true,
            medicalConditions: true,
            medicationDetails: true,
            dietaryRequirements: true,
            anaphylaxisActionPlan: true,
            medicareNumber: true,
            medicareExpiry: true,
            preferredName: true,
            livesWith: true,
            mainLanguageAtHome: true,
            languagesOtherThanEnglish: true,
            englishAssistance: true,
            indigenousStatus: true,
            vaccinationStatus: true,
            additionalNeeds: true,
          },
        },
      },
    });
    if (!source) throw ApiError.notFound("Enrolment not found");

    if (source.serviceId === serviceId) {
      throw ApiError.badRequest(
        `This enrolment is already at ${service.name}.`,
      );
    }

    const chosen = childIds
      ? source.childRecords.filter((c) => childIds.includes(c.id))
      : source.childRecords;

    if (chosen.length === 0) {
      throw ApiError.badRequest("Select at least one child to enrol.");
    }
    if (childIds && chosen.length !== childIds.length) {
      throw ApiError.badRequest(
        "Some of those children don't belong to this enrolment.",
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const copy = await tx.enrolmentSubmission.create({
        data: {
          serviceId,
          primaryParent: source.primaryParent as Prisma.InputJsonValue,
          secondaryParent: source.secondaryParent as Prisma.InputJsonValue,
          children: source.children as Prisma.InputJsonValue,
          emergencyContacts: source.emergencyContacts as Prisma.InputJsonValue,
          authorisedPickup: source.authorisedPickup as Prisma.InputJsonValue,
          consents: source.consents as Prisma.InputJsonValue,
          paymentMethod: source.paymentMethod,
          paymentDetails: source.paymentDetails as Prisma.InputJsonValue,
          referralSource: source.referralSource,
          signature: source.signature,
          termsAccepted: source.termsAccepted,
          privacyAccepted: source.privacyAccepted,
          debitAgreement: source.debitAgreement,
          courtOrders: source.courtOrders,
          courtOrderFiles: source.courtOrderFiles as Prisma.InputJsonValue,
          medicalFiles: source.medicalFiles as Prisma.InputJsonValue,
          documentUploads: source.documentUploads as Prisma.InputJsonValue,
          // Staff still confirm the new placement. Copying an approval
          // across would put a child on a roll nobody at that centre
          // agreed to take.
          status: "submitted",
          notes: `Duplicated from enrolment ${source.id}`,
        },
      });

      for (const c of chosen) {
        await tx.child.create({
          data: {
            enrolmentId: copy.id,
            serviceId,
            firstName: c.firstName,
            surname: c.surname,
            dob: c.dob,
            gender: c.gender,
            address: (c.address ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            culturalBackground: c.culturalBackground,
            schoolName: c.schoolName,
            yearLevel: c.yearLevel,
            crn: c.crn,
            medical: (c.medical ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            dietary: (c.dietary ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            medicalConditions: c.medicalConditions,
            medicationDetails: c.medicationDetails,
            dietaryRequirements: c.dietaryRequirements,
            anaphylaxisActionPlan: c.anaphylaxisActionPlan,
            medicareNumber: c.medicareNumber,
            medicareExpiry: c.medicareExpiry,
            preferredName: c.preferredName,
            livesWith: c.livesWith,
            mainLanguageAtHome: c.mainLanguageAtHome,
            languagesOtherThanEnglish: c.languagesOtherThanEnglish,
            englishAssistance: c.englishAssistance,
            indigenousStatus: c.indigenousStatus,
            vaccinationStatus: c.vaccinationStatus,
            additionalNeeds: c.additionalNeeds,
            placementReason,
            // Pending until the receiving centre confirms — same gate as
            // any new enrolment, so canBook() holds.
            status: "pending",
          },
        });

        // NOTE: bookings, attendance and invoices are deliberately NOT
        // copied. They belong to the centre that provided the care.
      }

      // Billing contacts at the destination, or the family is enrolled
      // there but can't be invoiced there.
      await upsertContactsFromSubmission(tx, {
        id: copy.id,
        serviceId,
        primaryParent: source.primaryParent,
        secondaryParent: source.secondaryParent,
      });

      if (move) {
        // Withdraw the originals rather than deleting them — attendance
        // and invoices already reference those rows, and the history of
        // care actually given must survive the move.
        await tx.child.updateMany({
          where: { id: { in: chosen.map((c) => c.id) } },
          data: { status: "withdrawn" },
        });
      }

      return copy;
    });

    logger.info("Enrolment duplicated to another service", {
      sourceEnrolmentId: id,
      newEnrolmentId: created.id,
      serviceId,
      serviceName: service.name,
      children: chosen.length,
      move,
      userId: session?.user?.id,
    });

    return NextResponse.json({
      ok: true,
      enrolmentId: created.id,
      serviceName: service.name,
      childrenCopied: chosen.length,
      moved: move,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
