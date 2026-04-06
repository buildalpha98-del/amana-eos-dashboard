import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

const MEDICAL_CONDITIONS = [
  "Asthma",
  "Anaphylaxis",
  "Diabetes",
  "Epilepsy",
  "ADHD",
  "Autism",
] as const;

const DIETARY_OPTIONS = [
  "Halal",
  "Vegetarian",
  "Vegan",
  "Nut Free",
  "Dairy Free",
  "Gluten Free",
  "Egg Free",
] as const;

const updateMedicalSchema = z.object({
  medicalConditions: z.array(z.string()).optional(),
  medicationDetails: z.string().nullable().optional(),
  anaphylaxisActionPlan: z.boolean().optional(),
  dietaryRequirements: z.array(z.string()).optional(),
  additionalNeeds: z.string().nullable().optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      surname: true,
      medicalConditions: true,
      medicationDetails: true,
      anaphylaxisActionPlan: true,
      dietaryRequirements: true,
      additionalNeeds: true,
      serviceId: true,
    },
  });

  if (!child) throw ApiError.notFound("Child not found");

  return NextResponse.json({
    ...child,
    availableConditions: MEDICAL_CONDITIONS,
    availableDietary: DIETARY_OPTIONS,
  });
});

export const PUT = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateMedicalSchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.child.findUnique({
    where: { id },
    select: { id: true, serviceId: true },
  });

  if (!existing) throw ApiError.notFound("Child not found");

  const updated = await prisma.child.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      medicalConditions: true,
      medicationDetails: true,
      anaphylaxisActionPlan: true,
      dietaryRequirements: true,
      additionalNeeds: true,
    },
  });

  return NextResponse.json(updated);
});
