import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendEnrolmentReceivedNotification } from "@/lib/notifications/enrolment";

// ── GET /api/parent/enrolments — list sibling enrolment applications ──

export const GET = withParentAuth(async (_req, { parent }) => {
  // Find all CentreContacts for this parent's email
  const contacts = await prisma.centreContact.findMany({
    where: { email: parent.email.toLowerCase().trim() },
    select: { id: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json([]);
  }

  const applications = await prisma.enrolmentApplication.findMany({
    where: { familyId: { in: contacts.map((c) => c.id) } },
    include: {
      service: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    applications.map((a) => ({
      id: a.id,
      childFirstName: a.childFirstName,
      childLastName: a.childLastName,
      childDateOfBirth: a.childDateOfBirth.toISOString(),
      serviceId: a.serviceId,
      serviceName: a.service.name,
      status: a.status,
      type: a.type,
      sessionTypes: a.sessionTypes,
      startDate: a.startDate?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      declineReason: a.declineReason,
    })),
  );
});

// ── POST /api/parent/enrolments — submit sibling enrolment application ──

const createSchema = z.object({
  serviceId: z.string().min(1),
  childFirstName: z.string().min(1, "First name is required"),
  childLastName: z.string().min(1, "Last name is required"),
  childDateOfBirth: z.string().min(1, "Date of birth is required"),
  childGender: z.string().optional(),
  childSchool: z.string().optional(),
  childYear: z.string().optional(),
  sessionTypes: z.array(z.string()).min(1, "Select at least one session type"),
  startDate: z.string().optional(),
  medicalConditions: z.array(z.string()).default([]),
  dietaryRequirements: z.array(z.string()).default([]),
  medicationDetails: z.string().optional(),
  anaphylaxisActionPlan: z.string().optional(),
  additionalNeeds: z.string().optional(),
  consentPhotography: z.boolean(),
  consentSunscreen: z.boolean(),
  consentFirstAid: z.boolean(),
  consentExcursions: z.boolean(),
  copyAuthorisedPickups: z.boolean().default(true),
  copyEmergencyContacts: z.boolean().default(true),
});

export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const data = createSchema.parse(body);

  // Verify parent has an enrolled child at this service
  const contact = await prisma.centreContact.findFirst({
    where: {
      email: parent.email.toLowerCase().trim(),
      serviceId: data.serviceId,
      status: "active",
    },
    select: { id: true },
  });

  if (!contact) {
    throw ApiError.badRequest(
      "You do not have an enrolled child at this service",
    );
  }

  // Verify at least one active child exists at this service for this family
  const existingChild = await prisma.child.findFirst({
    where: {
      serviceId: data.serviceId,
      status: "active",
      enrolment: {
        id: { in: parent.enrolmentIds },
      },
    },
    select: { id: true },
  });

  if (!existingChild) {
    throw ApiError.badRequest(
      "No active children found at this service for your family",
    );
  }

  const application = await prisma.enrolmentApplication.create({
    data: {
      serviceId: data.serviceId,
      familyId: contact.id,
      status: "pending",
      type: "sibling",
      childFirstName: data.childFirstName.trim(),
      childLastName: data.childLastName.trim(),
      childDateOfBirth: new Date(data.childDateOfBirth),
      childGender: data.childGender ?? null,
      childSchool: data.childSchool ?? null,
      childYear: data.childYear ?? null,
      sessionTypes: data.sessionTypes,
      startDate: data.startDate ? new Date(data.startDate) : null,
      medicalConditions: data.medicalConditions,
      dietaryRequirements: data.dietaryRequirements,
      medicationDetails: data.medicationDetails ?? null,
      anaphylaxisActionPlan: data.anaphylaxisActionPlan ?? null,
      additionalNeeds: data.additionalNeeds ?? null,
      consentPhotography: data.consentPhotography,
      consentSunscreen: data.consentSunscreen,
      consentFirstAid: data.consentFirstAid,
      consentExcursions: data.consentExcursions,
      copyAuthorisedPickups: data.copyAuthorisedPickups,
      copyEmergencyContacts: data.copyEmergencyContacts,
    },
    include: {
      service: { select: { name: true } },
    },
  });

  // Fire and forget notification
  sendEnrolmentReceivedNotification(application.id).catch(() => {});

  return NextResponse.json(
    {
      id: application.id,
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
      childDateOfBirth: application.childDateOfBirth.toISOString(),
      serviceId: application.serviceId,
      serviceName: application.service.name,
      status: application.status,
      type: application.type,
      createdAt: application.createdAt.toISOString(),
    },
    { status: 201 },
  );
});
