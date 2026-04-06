import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  phone: z.string().optional(),
  isEmergencyContact: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  photoId: z.string().nullable().optional(),
});

// PATCH — update a pickup
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, pickupId } = await context!.params!;

  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid update data", parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.authorisedPickup.findFirst({
    where: { id: pickupId, childId: id },
  });
  if (!existing) throw ApiError.notFound("Authorised pickup not found");

  const updated = await prisma.authorisedPickup.update({
    where: { id: pickupId },
    data: parsed.data,
  });

  return NextResponse.json(updated);
});

// DELETE — soft delete (set active=false)
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id, pickupId } = await context!.params!;

  const pickup = await prisma.authorisedPickup.findFirst({
    where: { id: pickupId, childId: id },
  });

  if (!pickup) throw ApiError.notFound("Authorised pickup not found");

  const updated = await prisma.authorisedPickup.update({
    where: { id: pickupId },
    data: { active: false },
  });

  return NextResponse.json(updated);
});
