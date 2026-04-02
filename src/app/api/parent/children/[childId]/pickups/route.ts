import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const createPickupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  phone: z.string().min(1, "Phone is required"),
  photoUrl: z.string().url().optional(),
});

const updatePickupSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  photoUrl: z.string().url().nullable().optional(),
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

export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.childId;
  if (!childId) throw ApiError.badRequest("childId is required");

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const pickups = await prisma.authorisedPickup.findMany({
    where: { childId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pickups);
});

export const POST = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.childId;
  if (!childId) throw ApiError.badRequest("childId is required");

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const body = await parseJsonBody(req);
  const parsed = createPickupSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid pickup data", parsed.error.flatten().fieldErrors);
  }

  const pickup = await prisma.authorisedPickup.create({
    data: {
      childId,
      ...parsed.data,
    },
  });

  return NextResponse.json(pickup, { status: 201 });
});

export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.childId;
  if (!childId) throw ApiError.badRequest("childId is required");

  await verifyChildAccess(childId, ctx.parent.enrolmentIds);

  const body = await parseJsonBody(req);
  const { pickupId, ...updateFields } = body as Record<string, unknown>;
  if (!pickupId || typeof pickupId !== "string") {
    throw ApiError.badRequest("pickupId is required");
  }

  const parsed = updatePickupSchema.safeParse(updateFields);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid update data", parsed.error.flatten().fieldErrors);
  }

  // Verify pickup belongs to this child
  const existing = await prisma.authorisedPickup.findUnique({
    where: { id: pickupId },
  });
  if (!existing || existing.childId !== childId) {
    throw ApiError.notFound("Pickup person not found");
  }

  const updated = await prisma.authorisedPickup.update({
    where: { id: pickupId },
    data: parsed.data,
  });

  return NextResponse.json(updated);
});
