import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const updateMedicalSchema = z.object({
  medicalConditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  immunisationStatus: z.string().optional(),
  dietary: z
    .object({
      requirements: z.array(z.string()).optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  actionPlanUrl: z.string().url().optional(),
});

export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.childId;
  if (!childId) throw ApiError.badRequest("childId is required");

  const body = await parseJsonBody(req);
  const parsed = updateMedicalSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid medical data", parsed.error.flatten().fieldErrors);
  }

  const { parent } = ctx;

  // Verify child belongs to parent
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true, medical: true, dietary: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  const { medicalConditions, allergies, medications, immunisationStatus, dietary, actionPlanUrl } =
    parsed.data;

  // Merge into existing medical JSON
  const existingMedical = (child.medical as Record<string, unknown>) ?? {};
  const updatedMedical = { ...existingMedical };
  if (medicalConditions !== undefined) updatedMedical.conditions = medicalConditions;
  if (allergies !== undefined) updatedMedical.allergies = allergies;
  if (medications !== undefined) updatedMedical.medications = medications;
  if (immunisationStatus !== undefined) updatedMedical.immunisationStatus = immunisationStatus;
  if (actionPlanUrl !== undefined) updatedMedical.actionPlanUrl = actionPlanUrl;

  // Merge dietary
  const existingDietary = (child.dietary as Record<string, unknown>) ?? {};
  const updatedDietary = dietary ? { ...existingDietary, ...dietary } : existingDietary;

  const updated = await prisma.child.update({
    where: { id: childId },
    data: {
      medical: updatedMedical as Prisma.InputJsonValue,
      dietary: Object.keys(updatedDietary).length > 0
        ? (updatedDietary as Prisma.InputJsonValue)
        : undefined,
    },
    select: {
      id: true,
      firstName: true,
      surname: true,
      medical: true,
      dietary: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
});
