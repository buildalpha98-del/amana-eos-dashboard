import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

// ── GET /api/enrolment-applications/[id] — full application detail ──

export const GET = withApiAuth(
  async (req: NextRequest, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("Missing application ID");

    const application = await prisma.enrolmentApplication.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true } },
        family: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            serviceId: true,
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    if (!application) {
      throw ApiError.notFound("Application not found");
    }

    // Fetch existing siblings at this service for the same family email
    const familyContacts = await prisma.centreContact.findMany({
      where: {
        email: application.family.email,
        serviceId: application.serviceId,
      },
      select: { id: true },
    });

    // Find children linked to these contacts via enrolments
    const siblings = await prisma.child.findMany({
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
      select: {
        id: true,
        firstName: true,
        surname: true,
        dob: true,
        yearLevel: true,
        status: true,
        authorisedPickups: {
          where: { active: true },
          select: { id: true, name: true, relationship: true, phone: true },
        },
      },
    });

    return NextResponse.json({
      id: application.id,
      serviceId: application.serviceId,
      serviceName: application.service.name,
      familyId: application.familyId,
      parentName: [application.family.firstName, application.family.lastName]
        .filter(Boolean)
        .join(" ") || application.family.email,
      parentEmail: application.family.email,
      status: application.status,
      type: application.type,
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
      childDateOfBirth: application.childDateOfBirth.toISOString(),
      childGender: application.childGender,
      childSchool: application.childSchool,
      childYear: application.childYear,
      sessionTypes: application.sessionTypes,
      startDate: application.startDate?.toISOString() ?? null,
      medicalConditions: application.medicalConditions,
      dietaryRequirements: application.dietaryRequirements,
      medicationDetails: application.medicationDetails,
      anaphylaxisActionPlan: application.anaphylaxisActionPlan,
      additionalNeeds: application.additionalNeeds,
      consentPhotography: application.consentPhotography,
      consentSunscreen: application.consentSunscreen,
      consentFirstAid: application.consentFirstAid,
      consentExcursions: application.consentExcursions,
      copyAuthorisedPickups: application.copyAuthorisedPickups,
      copyEmergencyContacts: application.copyEmergencyContacts,
      reviewedAt: application.reviewedAt?.toISOString() ?? null,
      reviewedBy: application.reviewedBy?.name ?? null,
      declineReason: application.declineReason,
      notes: application.notes,
      createdChildId: application.createdChildId,
      ownaExportedAt: application.ownaExportedAt?.toISOString() ?? null,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
      siblings: siblings.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.surname,
        dateOfBirth: s.dob?.toISOString() ?? null,
        yearLevel: s.yearLevel,
        status: s.status,
        authorisedPickups: s.authorisedPickups,
      })),
    });
  },
);
