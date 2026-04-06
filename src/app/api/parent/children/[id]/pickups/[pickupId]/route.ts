import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  notes: z.string().max(500).nullable().optional(),
});

async function verifyChildAccess(childId: string, enrolmentIds: string[]) {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }
  return child;
}

// PATCH — parent can edit their own pickup entries (name, relationship, phone, notes)
// Parents cannot change active status — staff only
export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  const pickupId = params?.pickupId;
  if (!childId || !pickupId) throw ApiError.badRequest("childId and pickupId are required");

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid update data", parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.authorisedPickup.findFirst({
    where: { id: pickupId, childId },
  });
  if (!existing) throw ApiError.notFound("Pickup person not found");

  const updated = await prisma.authorisedPickup.update({
    where: { id: pickupId },
    data: parsed.data,
  });

  return NextResponse.json(updated);
});
