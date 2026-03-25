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

const updateAccountSchema = z.object({
  phone: z.string().min(1).optional(),
  address: z
    .object({
      street: z.string().optional(),
      suburb: z.string().optional(),
      state: z.string().optional(),
      postcode: z.string().optional(),
    })
    .optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
});

export const PATCH = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid update data", parsed.error.flatten());
  }

  const { phone, address, emergencyContacts } = parsed.data;

  if (parent.enrolmentIds.length === 0) {
    throw ApiError.notFound("No enrolment found for this account");
  }

  // Update each enrolment's parent data
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

    const emailLower = parent.email.toLowerCase().trim();
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

    if (isPrimary && primary) {
      const updatedParent = { ...primary };
      if (phone !== undefined) updatedParent.mobile = phone;
      if (address !== undefined) updatedParent.address = address;
      updateData.primaryParent = updatedParent;
      updates.push({ id: enrolmentId, field: "primaryParent" });
    } else if (isSecondary && secondary) {
      const updatedParent = { ...secondary };
      if (phone !== undefined) updatedParent.mobile = phone;
      if (address !== undefined) updatedParent.address = address;
      updateData.secondaryParent = updatedParent;
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
