import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import {
  primaryParentSchema,
  emergencyContactSchema,
  authorisedPickupSchema,
} from "@/lib/schemas/json-fields";
import { logger } from "@/lib/logger";

/**
 * Body schema — optional partial patch of relationship JSON fields.
 *
 * `.strict()` rejects any unknown key (including `primaryParent`, which is
 * explicitly enrolment-flow-only — the primary carer record can only be
 * edited through the enrolment submission flow).
 *
 * `secondaryParent` accepts `null` as the "cleared" signal — the handler
 * maps it to `Prisma.JsonNull` (SQL `NULL`). An empty `{}` would fail
 * validation because `primaryParentSchema` requires `firstName` + `surname`.
 */
const bodySchema = z
  .object({
    secondaryParent: primaryParentSchema.nullable().optional(),
    emergencyContacts: z.array(emergencyContactSchema).optional(),
    authorisedPickup: z.array(authorisedPickupSchema).optional(),
  })
  .strict();

/**
 * PATCH /api/children/[id]/relationships
 *
 * Inline-edit carer + emergency + authorised-pickup JSON fields on the child's
 * enrolment record. No read-merge-write — Prisma's `update` preserves columns
 * not supplied, and the client always sends the full list for emergency /
 * pickup (so removing an item means sending the filtered array). Secondary
 * carer is replace-or-null: pass the full object to set, or `null` to clear.
 *
 * Role matrix:
 * - owner / head_office / admin → can edit any child
 * - coordinator → can edit children at their own service only
 * - staff / member / marketing → 403
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  const role = session.user.role ?? "";
  const canEdit = isAdminRole(role) || role === "member";
  if (!canEdit) throw ApiError.forbidden();

  const child = await prisma.child.findUnique({
    where: { id },
    select: { id: true, serviceId: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound();
  if (!child.enrolmentId) {
    throw ApiError.badRequest("Child has no enrolment record");
  }

  // Coordinator must be at the same service
  if (role === "member" && child.serviceId !== session.user.serviceId) {
    throw ApiError.forbidden();
  }

  const patch = parsed.data;
  const data: Prisma.EnrolmentSubmissionUpdateInput = {};

  if (patch.secondaryParent !== undefined) {
    // null → SQL NULL via Prisma.JsonNull; object → JSON value
    data.secondaryParent =
      patch.secondaryParent === null
        ? Prisma.JsonNull
        : (patch.secondaryParent as Prisma.InputJsonValue);
  }
  if (patch.emergencyContacts !== undefined) {
    data.emergencyContacts = patch.emergencyContacts as Prisma.InputJsonValue;
  }
  if (patch.authorisedPickup !== undefined) {
    data.authorisedPickup = patch.authorisedPickup as Prisma.InputJsonValue;
  }

  const updated = await prisma.enrolmentSubmission.update({
    where: { id: child.enrolmentId },
    data,
  });

  logger.info("Activity: child relationships updated", {
    childId: id,
    enrolmentId: child.enrolmentId,
    userId: session.user.id,
    keys: Object.keys(parsed.data),
  });

  return NextResponse.json(updated);
});
