import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const bulkBookingSchema = z.object({
  childId: z.string().min(1),
  serviceId: z.string().min(1),
  bookings: z
    .array(
      z.object({
        date: z.string().min(1),
        sessionType: z.enum(["bsc", "asc", "vc"]),
      }),
    )
    .min(1, "At least one booking required")
    .max(10, "Maximum 10 bookings at once"),
});

/**
 * POST /api/parent/bookings/bulk
 *
 * Creates multiple booking requests in a single transaction.
 * Skips duplicates (already booked dates).
 */
export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = bulkBookingSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  const { childId, serviceId, bookings } = parsed.data;

  // Verify the child belongs to the parent
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { enrolmentId: true },
  });
  if (!child || !child.enrolmentId || !parent.enrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }

  // Create all bookings in a transaction, skipping duplicates
  const data = bookings.map((b) => ({
    childId,
    serviceId,
    date: new Date(b.date),
    sessionType: b.sessionType as "bsc" | "asc" | "vc",
    status: "requested" as const,
    type: "casual" as const,
  }));

  const result = await prisma.booking.createMany({
    data,
    skipDuplicates: true,
  });

  return NextResponse.json({
    created: result.count,
    requested: bookings.length,
    skipped: bookings.length - result.count,
  }, { status: 201 });
});
