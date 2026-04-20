import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { generateBookings } from "@/lib/booking-generator";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const patchSchema = z.object({
  status: z.string().optional(),
  serviceId: z.string().optional(),
  schoolName: z.string().optional(),
  yearLevel: z.string().optional(),
  generateBookings: z.boolean().optional(),
});
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const child = await prisma.child.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      enrolment: {
        select: {
          id: true,
          token: true,
          primaryParent: true,
          secondaryParent: true,
          emergencyContacts: true,
          authorisedPickup: true,
          consents: true,
          paymentMethod: true,
          paymentDetails: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(child);
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updateData[key] = value;
  }

  const { generateBookings: shouldGenerate, ...rest } = updateData;

  const updated = await prisma.child.update({
    where: { id },
    data: rest,
  });

  // Manually trigger booking generation for this child
  if (shouldGenerate && updated.serviceId && updated.bookingPrefs) {
    const bookings = generateBookings(updated.id, updated.serviceId, updated.bookingPrefs);
    if (bookings.length > 0) {
      const result = await prisma.booking.createMany({
        data: bookings,
        skipDuplicates: true,
      });
      logger.info("Manual booking generation", {
        childId: updated.id,
        bookingsCreated: result.count,
      });
    }
  }

  return NextResponse.json(updated);
});
