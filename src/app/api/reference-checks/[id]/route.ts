/**
 * GET    /api/reference-checks/[id] — single check
 * PATCH  /api/reference-checks/[id] — update fields/status
 * DELETE /api/reference-checks/[id] — soft-delete (owner only)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const METHODS = [
  "phone",
  "video",
  "email",
  "written_response",
  "in_person",
] as const;

const STATUSES = [
  "pending",
  "contacted",
  "completed",
  "unable_to_reach",
  "declined",
] as const;

const RECOMMENDATIONS = [
  "strong_positive",
  "positive",
  "neutral",
  "reservations",
  "do_not_recommend",
] as const;

const patchSchema = z.object({
  refereeName: z.string().min(1).max(200).optional(),
  refereeRelationship: z.string().min(1).max(200).optional(),
  refereeOrganisation: z.string().max(200).nullable().optional(),
  refereePhone: z.string().max(40).nullable().optional(),
  refereeEmail: z.string().email().max(200).nullable().optional(),
  method: z.enum(METHODS).optional(),
  contactedAt: z.string().datetime().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  recommendation: z.enum(RECOMMENDATIONS).nullable().optional(),
  notes: z.string().min(1).max(20_000).optional(),
  redFlags: z.string().max(20_000).nullable().optional(),
  employmentVerified: z.boolean().nullable().optional(),
  wouldRehire: z.boolean().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadCheck(id: string) {
  const c = await prisma.referenceCheck.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      checkedBy: { select: { id: true, name: true } },
    },
  });
  if (!c || c.deleted) throw ApiError.notFound("Reference check not found");
  return c;
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const c = await loadCheck(id);
    return NextResponse.json(c);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await loadCheck(id);

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const p = parsed.data;

    const update: Record<string, unknown> = {};
    if (p.refereeName !== undefined) update.refereeName = p.refereeName.trim();
    if (p.refereeRelationship !== undefined)
      update.refereeRelationship = p.refereeRelationship.trim();
    if (p.refereeOrganisation !== undefined)
      update.refereeOrganisation = p.refereeOrganisation;
    if (p.refereePhone !== undefined) update.refereePhone = p.refereePhone;
    if (p.refereeEmail !== undefined) update.refereeEmail = p.refereeEmail;
    if (p.method !== undefined) update.method = p.method;
    if (p.contactedAt !== undefined)
      update.contactedAt = p.contactedAt ? new Date(p.contactedAt) : null;
    if (p.status !== undefined) update.status = p.status;
    if (p.recommendation !== undefined) update.recommendation = p.recommendation;
    if (p.notes !== undefined) update.notes = p.notes;
    if (p.redFlags !== undefined) update.redFlags = p.redFlags;
    if (p.employmentVerified !== undefined)
      update.employmentVerified = p.employmentVerified;
    if (p.wouldRehire !== undefined) update.wouldRehire = p.wouldRehire;

    const updated = await prisma.referenceCheck.update({
      where: { id },
      data: update,
      include: {
        user: { select: { id: true, name: true } },
        checkedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "reference_check_updated",
        entityType: "ReferenceCheck",
        entityId: id,
        details: JSON.parse(
          JSON.stringify({
            changedKeys: Object.keys(update),
            previousStatus: existing.status,
            subjectUserId: existing.userId,
          }),
        ),
      },
    });

    logger.info("Reference check updated", {
      refCheckId: id,
      changedKeys: Object.keys(update),
      actorId: session!.user.id,
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const c = await loadCheck(id);

    await prisma.referenceCheck.update({
      where: { id },
      data: { deleted: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "reference_check_deleted",
        entityType: "ReferenceCheck",
        entityId: id,
        details: {
          subjectUserId: c.userId,
          refereeName: c.refereeName,
        },
      },
    });

    logger.warn("Reference check soft-deleted", {
      refCheckId: id,
      actorId: session!.user.id,
      subjectUserId: c.userId,
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner"] },
);
