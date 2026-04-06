import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

const createPickupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  phone: z.string().min(1, "Phone number is required"),
  photoId: z.string().nullable().optional(),
  isEmergencyContact: z.boolean().optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  const pickups = await prisma.authorisedPickup.findMany({
    where: { childId: id, active: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ pickups });
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = createPickupSchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!child) throw ApiError.notFound("Child not found");

  const pickup = await prisma.authorisedPickup.create({
    data: {
      childId: id,
      ...parsed.data,
      isEmergencyContact: parsed.data.isEmergencyContact ?? false,
    },
  });

  return NextResponse.json(pickup, { status: 201 });
});
