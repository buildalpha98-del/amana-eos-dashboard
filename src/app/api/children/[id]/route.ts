import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { generateBookings } from "@/lib/booking-generator";
import { logger } from "@/lib/logger";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

const patchSchema = z.object({
  // Existing
  status: z.string().optional(),
  serviceId: z.string().optional(),
  schoolName: z.string().optional(),
  yearLevel: z.string().optional(),
  generateBookings: z.boolean().optional(),
  // Details tab
  firstName: z.string().min(1).max(100).optional(),
  surname: z.string().min(1).max(100).optional(),
  dob: z.string().datetime().optional().nullable(),
  gender: z
    .enum(["male", "female", "other", "prefer_not_to_say"])
    .optional()
    .nullable(),
  crn: z.string().max(20).optional().nullable(),
  photo: z.string().url().optional().nullable(),
  enrolmentDate: z.string().datetime().optional().nullable(),
  exitDate: z.string().datetime().optional().nullable(),
  exitCategory: z.string().max(100).optional().nullable(),
  exitReason: z.string().max(500).optional().nullable(),
  // Medical tab (added early to avoid churn; UI ships in Commit 9)
  medicalConditions: z.array(z.string()).optional(),
  medicareNumber: z.string().max(20).optional().nullable(),
  medicareExpiry: z.string().datetime().optional().nullable(),
  medicareRef: z.string().max(10).optional().nullable(),
  vaccinationStatus: z
    .enum(["up_to_date", "overdue", "exempt", "unknown"])
    .optional()
    .nullable(),
  // Room/Days tab — fortnight pattern & other booking prefs JSON blob
  bookingPrefs: z.record(z.string(), z.unknown()).optional(),
});

/** Keys that require coordinator+ to patch (non-admin/coord writers get 403). */
const RESTRICTED_KEYS = [
  "medicalConditions",
  "medicareNumber",
  "medicareExpiry",
  "medicareRef",
  "vaccinationStatus",
  "bookingPrefs",
] as const;

/**
 * Coerce ISO date strings (or null) to Date values for Prisma.
 * Leaves other values untouched.
 */
const DATE_FIELDS = new Set<string>([
  "dob",
  "enrolmentDate",
  "exitDate",
  "medicareExpiry",
]);

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

  // ── Role narrowing ─────────────────────────────────────────
  const role = session.user.role ?? "";
  const isCoordOrAbove = isAdminRole(role) || role === "coordinator";
  const hasRestrictedField = RESTRICTED_KEYS.some(
    (k) => parsed.data[k] !== undefined,
  );
  if (hasRestrictedField && !isCoordOrAbove) {
    throw ApiError.forbidden();
  }

  // Coordinator must only edit children at their own service
  if (role === "coordinator") {
    const existing = await prisma.child.findUnique({
      where: { id },
      select: { serviceId: true },
    });
    if (!existing) throw ApiError.notFound();
    if (!existing.serviceId || existing.serviceId !== session.user.serviceId) {
      throw ApiError.forbidden();
    }
  }

  // ── Build the base update payload (excluding bookingPrefs + control flag) ──
  const { generateBookings: shouldGenerate, bookingPrefs, ...rest } = parsed.data;
  const otherFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (value !== null && DATE_FIELDS.has(key)) {
      otherFields[key] = new Date(value as string);
    } else {
      otherFields[key] = value;
    }
  }

  let updated: Awaited<ReturnType<typeof prisma.child.update>>;

  if (bookingPrefs !== undefined) {
    // ── Transactional read-merge-write on bookingPrefs JSON ──
    updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.child.findUnique({
        where: { id },
        select: { bookingPrefs: true },
      });
      const existingPrefs =
        existing?.bookingPrefs && typeof existing.bookingPrefs === "object"
          ? (existing.bookingPrefs as Record<string, unknown>)
          : {};
      const merged: Record<string, unknown> = {
        ...existingPrefs,
        ...bookingPrefs,
      };
      return tx.child.update({
        where: { id },
        data: {
          ...otherFields,
          bookingPrefs: merged as Prisma.InputJsonValue,
        },
      });
    });
  } else {
    updated = await prisma.child.update({
      where: { id },
      data: otherFields,
    });
  }

  // Manually trigger booking generation for this child
  if (shouldGenerate && updated.serviceId && updated.bookingPrefs) {
    const bookings = generateBookings(
      updated.id,
      updated.serviceId,
      updated.bookingPrefs,
    );
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

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session.user.role ?? "";

  if (!isAdminRole(role)) {
    throw ApiError.forbidden("Only admins can delete child records");
  }

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true, firstName: true, surname: true },
  });
  if (!child) throw ApiError.notFound("Child not found");

  await prisma.$transaction(async (tx) => {
    await tx.authorisedPickup.deleteMany({ where: { childId: id } });
    await tx.childDocument.deleteMany({ where: { childId: id } });
    await tx.booking.deleteMany({ where: { childId: id } });
    await tx.child.delete({ where: { id } });
  });

  logger.info("Child record deleted", {
    childId: id,
    childName: `${child.firstName} ${child.surname}`,
    deletedBy: session.user.id,
  });

  return NextResponse.json({ success: true });
}, { minRole: "head_office" });
