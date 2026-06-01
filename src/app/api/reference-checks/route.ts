/**
 * GET  /api/reference-checks?userId=X — list checks for a subject
 * POST /api/reference-checks            — create new check
 *
 * Admin-only on both ends. References can contain identifying detail
 * about third parties; subjects never see references taken about
 * themselves through this surface.
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

const createSchema = z.object({
  userId: z.string().min(1),
  refereeName: z.string().min(1).max(200),
  refereeRelationship: z.string().min(1).max(200),
  refereeOrganisation: z.string().max(200).nullable().optional(),
  refereePhone: z.string().max(40).nullable().optional(),
  refereeEmail: z.string().email().max(200).nullable().optional(),
  method: z.enum(METHODS),
  status: z.enum(STATUSES).optional(),
  contactedAt: z.string().datetime().nullable().optional(),
  recommendation: z.enum(RECOMMENDATIONS).nullable().optional(),
  notes: z.string().min(1).max(20_000),
  redFlags: z.string().max(20_000).nullable().optional(),
  employmentVerified: z.boolean().nullable().optional(),
  wouldRehire: z.boolean().nullable().optional(),
});

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    const checks = await prisma.referenceCheck.findMany({
      where: { userId, deleted: false },
      include: {
        checkedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ contactedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ checks });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = parsed.data;

    const subject = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true },
    });
    if (!subject) throw ApiError.notFound("Subject user not found");

    const created = await prisma.referenceCheck.create({
      data: {
        userId: data.userId,
        checkedById: session!.user.id,
        refereeName: data.refereeName.trim(),
        refereeRelationship: data.refereeRelationship.trim(),
        refereeOrganisation: data.refereeOrganisation ?? null,
        refereePhone: data.refereePhone ?? null,
        refereeEmail: data.refereeEmail ?? null,
        method: data.method,
        contactedAt: data.contactedAt ? new Date(data.contactedAt) : null,
        status: data.status ?? "pending",
        recommendation: data.recommendation ?? null,
        notes: data.notes,
        redFlags: data.redFlags ?? null,
        employmentVerified: data.employmentVerified ?? null,
        wouldRehire: data.wouldRehire ?? null,
      },
      include: {
        checkedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "reference_check_created",
        entityType: "ReferenceCheck",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: subject.name,
          refereeName: data.refereeName,
          method: data.method,
        },
      },
    });

    logger.info("Reference check created", {
      refCheckId: created.id,
      subjectUserId: data.userId,
      checkedById: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
