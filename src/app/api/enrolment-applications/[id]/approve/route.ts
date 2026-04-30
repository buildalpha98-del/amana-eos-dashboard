import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendEnrolmentApprovedNotification } from "@/lib/notifications/enrolment";
import { logger } from "@/lib/logger";

const approveSchema = z.object({
  notes: z.string().optional(),
});

// ── POST /api/enrolment-applications/[id]/approve ──

export const POST = withApiAuth(
  async (req: NextRequest, session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("Missing application ID");

    const body = await parseJsonBody(req);
    const data = approveSchema.parse(body);

    // Load application
    const application = await prisma.enrolmentApplication.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true } },
        family: { select: { id: true, email: true } },
      },
    });

    if (!application) {
      throw ApiError.notFound("Application not found");
    }

    if (application.status !== "pending") {
      throw ApiError.badRequest(
        `Application is already ${application.status}`,
      );
    }

    // Find a sibling at this service to copy pickups from
    let siblingChild: { id: string } | null = null;
    if (application.copyAuthorisedPickups) {
      siblingChild = await prisma.child.findFirst({
        where: {
          serviceId: application.serviceId,
          status: "active",
          enrolment: {
            OR: [
              {
                primaryParent: {
                  path: ["email"],
                  string_contains: application.family.email,
                },
              },
            ],
          },
        },
        select: { id: true },
      });
    }

    // Use a transaction to create child + update application atomically
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the child record
      const child = await tx.child.create({
        data: {
          firstName: application.childFirstName,
          surname: application.childLastName,
          dob: application.childDateOfBirth,
          gender: application.childGender,
          schoolName: application.childSchool,
          yearLevel: application.childYear,
          serviceId: application.serviceId,
          status: "active",
          medicalConditions: application.medicalConditions,
          dietaryRequirements: application.dietaryRequirements,
          medicationDetails: application.medicationDetails,
          anaphylaxisActionPlan: application.anaphylaxisActionPlan
            ? true
            : false,
          additionalNeeds: application.additionalNeeds,
        },
      });

      // 2. Copy authorised pickups from sibling
      if (application.copyAuthorisedPickups && siblingChild) {
        const pickups = await tx.authorisedPickup.findMany({
          where: { childId: siblingChild.id, active: true },
        });

        if (pickups.length > 0) {
          await tx.authorisedPickup.createMany({
            data: pickups.map((p) => ({
              childId: child.id,
              name: p.name,
              relationship: p.relationship,
              phone: p.phone,
              photoUrl: p.photoUrl,
              photoId: p.photoId,
              isEmergencyContact: p.isEmergencyContact,
              active: true,
              notes: p.notes,
            })),
          });
        }
      }

      // 3. Create booking records for requested session types
      if (application.startDate && application.sessionTypes.length > 0) {
        const sessionTypeMap: Record<string, string> = {
          BSC: "bsc",
          ASC: "asc",
          VAC: "vc",
        };

        const bookingData = application.sessionTypes
          .map((st) => sessionTypeMap[st])
          .filter(Boolean)
          .map((sessionType) => ({
            childId: child.id,
            serviceId: application.serviceId,
            date: application.startDate!,
            sessionType: sessionType as "bsc" | "asc" | "vc",
            status: "confirmed" as const,
            type: "permanent" as const,
            requestedById: application.familyId,
          }));

        if (bookingData.length > 0) {
          await tx.booking.createMany({
            data: bookingData,
            skipDuplicates: true,
          });
        }
      }

      // 4. Update the application
      const updated = await tx.enrolmentApplication.update({
        where: { id },
        data: {
          status: "approved",
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          createdChildId: child.id,
          notes: data.notes ?? null,
        },
        include: {
          service: { select: { name: true } },
        },
      });

      return { application: updated, child };
    });

    // Fire and forget notification
    sendEnrolmentApprovedNotification(id).catch((err) => {
      logger.error("Failed to send approval notification", { applicationId: id, err });
    });

    return NextResponse.json({
      application: {
        id: result.application.id,
        status: result.application.status,
        reviewedAt: result.application.reviewedAt?.toISOString(),
        createdChildId: result.application.createdChildId,
      },
      child: {
        id: result.child.id,
        firstName: result.child.firstName,
        lastName: result.child.surname,
      },
    });
  },
  { minRole: "member" },
);
