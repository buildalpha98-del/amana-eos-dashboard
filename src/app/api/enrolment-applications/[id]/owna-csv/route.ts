/**
 * GET /api/enrolment-applications/[id]/owna-csv
 *
 * Returns a single-row OWNA-importable CSV for the given enrolment
 * application. Sets ownaExportedAt = now() so admins can see which records
 * have been exported. Re-downloads update the timestamp.
 *
 * CentreContact (the `family` relation) stores only email + firstName + lastName.
 * Address and mobile live on EnrolmentSubmission.primaryParent JSON. We look up
 * the most recent non-draft submission for the same email + serviceId, and fall
 * back to empty strings if no match exists (child + parent name + email still
 * export — admin can fill address in OWNA's UI manually if needed).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { buildOwnaCsv, ownaCsvFilename } from "@/lib/owna-csv";

interface SubmissionParentJson {
  firstName?: string;
  surname?: string;
  email?: string;
  mobile?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
}

/**
 * Look up the most recent non-draft EnrolmentSubmission where
 * primaryParent.email (or secondaryParent.email) matches the provided email,
 * scoped to the given service. Returns the best matching parent JSON or null.
 */
async function loadParentContactJson(
  email: string,
  serviceId: string,
): Promise<SubmissionParentJson | null> {
  const emailLower = email.toLowerCase().trim();
  // We match via JSON path to keep the query efficient.
  const submission = await prisma.enrolmentSubmission.findFirst({
    where: {
      serviceId,
      status: { not: "draft" },
      OR: [
        { primaryParent: { path: ["email"], string_contains: emailLower } },
        { secondaryParent: { path: ["email"], string_contains: emailLower } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { primaryParent: true, secondaryParent: true },
  });
  if (!submission) return null;

  // Pick whichever slot matches this email.
  const primary = submission.primaryParent as SubmissionParentJson | null;
  const secondary = submission.secondaryParent as SubmissionParentJson | null;
  if (primary?.email?.toLowerCase().trim() === emailLower) return primary;
  if (secondary?.email?.toLowerCase().trim() === emailLower) return secondary;
  return primary ?? secondary;
}

export const GET = withApiAuth(
  async (req: NextRequest, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("Missing application ID");

    const application = await prisma.enrolmentApplication.findUnique({
      where: { id },
      include: {
        family: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!application) {
      throw ApiError.notFound("Application not found");
    }

    const contact = await loadParentContactJson(
      application.family.email,
      application.serviceId,
    );

    const csv = buildOwnaCsv({
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
      childDateOfBirth: application.childDateOfBirth,
      childGender: application.childGender,
      childSchool: application.childSchool,
      childYear: application.childYear,
      sessionTypes: application.sessionTypes,
      startDate: application.startDate,
      medicalConditions: application.medicalConditions,
      dietaryRequirements: application.dietaryRequirements,
      medicationDetails: application.medicationDetails,
      additionalNeeds: application.additionalNeeds,
      parent: {
        firstName: application.family.firstName ?? contact?.firstName ?? "",
        lastName: application.family.lastName ?? contact?.surname ?? "",
        email: application.family.email,
        phone: contact?.mobile ?? "",
        address: contact?.address ?? "",
        suburb: contact?.suburb ?? "",
        state: contact?.state ?? "",
        postcode: contact?.postcode ?? "",
      },
    });

    await prisma.enrolmentApplication.update({
      where: { id },
      data: { ownaExportedAt: new Date() },
    });

    const filename = ownaCsvFilename({
      childFirstName: application.childFirstName,
      childLastName: application.childLastName,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { minRole: "coordinator" },
);
