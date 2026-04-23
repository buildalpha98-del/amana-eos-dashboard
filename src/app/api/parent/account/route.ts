import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const emergencyContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
});

const addressSchema = z.object({
  street: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
});

const updateAccountSchema = z.object({
  // Existing — synced to both the enrolment JSON and CentreContact
  phone: z.string().min(1).optional(),
  address: addressSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),

  // Structured profile fields — written only to CentreContact
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD").optional(),
  crn: z.string().trim().max(50).optional(),
  relationship: z.string().trim().max(60).optional(),
  occupation: z.string().trim().max(120).optional(),
  workplace: z.string().trim().max(120).optional(),
  workPhone: z.string().trim().max(40).optional(),
});

export const PATCH = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid update data", parsed.error.flatten());
  }

  const {
    phone,
    address,
    emergencyContacts,
    firstName,
    lastName,
    dob,
    crn,
    relationship,
    occupation,
    workplace,
    workPhone,
  } = parsed.data;

  if (parent.enrolmentIds.length === 0) {
    throw ApiError.notFound("No enrolment found for this account");
  }

  // 1. Sync to all CentreContact rows this parent owns (primary source of truth
  //    for structured profile going forward)
  const emailLower = parent.email.toLowerCase().trim();
  const contactUpdate: Record<string, unknown> = {};
  if (firstName !== undefined) contactUpdate.firstName = firstName;
  if (lastName !== undefined) contactUpdate.lastName = lastName;
  if (phone !== undefined) contactUpdate.mobile = phone;
  if (dob !== undefined) contactUpdate.dob = new Date(dob);
  if (crn !== undefined) contactUpdate.crn = crn || null;
  if (relationship !== undefined) contactUpdate.relationship = relationship || null;
  if (occupation !== undefined) contactUpdate.occupation = occupation || null;
  if (workplace !== undefined) contactUpdate.workplace = workplace || null;
  if (workPhone !== undefined) contactUpdate.workPhone = workPhone || null;
  if (address !== undefined) contactUpdate.address = address;

  if (Object.keys(contactUpdate).length > 0) {
    await prisma.centreContact.updateMany({
      where: { email: emailLower },
      data: contactUpdate,
    });
  }

  // 2. Keep the enrolment JSON blob in sync for historical record + legacy readers
  const updates: Array<{ id: string; field: string }> = [];

  for (const enrolmentId of parent.enrolmentIds) {
    const enrolment = await prisma.enrolmentSubmission.findUnique({
      where: { id: enrolmentId },
      select: {
        id: true,
        primaryParent: true,
        secondaryParent: true,
        emergencyContacts: true,
      },
    });

    if (!enrolment) continue;

    const primary = enrolment.primaryParent as Record<string, unknown> | null;
    const secondary = enrolment.secondaryParent as Record<string, unknown> | null;

    const isPrimary =
      primary &&
      typeof primary.email === "string" &&
      primary.email.toLowerCase().trim() === emailLower;
    const isSecondary =
      !isPrimary &&
      secondary &&
      typeof secondary.email === "string" &&
      secondary.email.toLowerCase().trim() === emailLower;

    if (!isPrimary && !isSecondary) continue;

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    const mergeIntoParent = (p: Record<string, unknown>) => {
      const out = { ...p };
      if (phone !== undefined) out.mobile = phone;
      if (address !== undefined) out.address = address;
      if (firstName !== undefined) out.firstName = firstName;
      if (lastName !== undefined) out.surname = lastName;
      if (dob !== undefined) out.dob = dob;
      if (crn !== undefined) out.crn = crn;
      if (relationship !== undefined) out.relationship = relationship;
      if (occupation !== undefined) out.occupation = occupation;
      if (workplace !== undefined) out.workplace = workplace;
      if (workPhone !== undefined) out.workPhone = workPhone;
      return out;
    };

    if (isPrimary && primary) {
      updateData.primaryParent = mergeIntoParent(primary);
      updates.push({ id: enrolmentId, field: "primaryParent" });
    } else if (isSecondary && secondary) {
      updateData.secondaryParent = mergeIntoParent(secondary);
      updates.push({ id: enrolmentId, field: "secondaryParent" });
    }

    if (emergencyContacts !== undefined) {
      updateData.emergencyContacts = emergencyContacts;
      updates.push({ id: enrolmentId, field: "emergencyContacts" });
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.enrolmentSubmission.update({
        where: { id: enrolmentId },
        data: updateData,
      });
    }
  }

  logger.info("Parent account updated", {
    email: parent.email,
    updatedEnrolments: updates.length,
    fields: updates.map((u) => u.field),
  });

  return NextResponse.json({
    success: true,
    updatedEnrolments: updates.length,
  });
});
