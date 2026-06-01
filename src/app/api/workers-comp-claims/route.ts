/**
 * GET  /api/workers-comp-claims?userId=X  — list claims for a user
 * POST /api/workers-comp-claims              — create a claim
 *
 * Admin / owner / head_office only. Workers comp records contain
 * medical detail; staff don't get self-service read access for v1.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const STATUSES = [
  "lodged",
  "under_review",
  "accepted",
  "declined",
  "on_hold",
  "closed",
  "reopened",
] as const;

const createSchema = z.object({
  userId: z.string().min(1),
  incidentId: z.string().min(1).nullable().optional(),
  claimNumber: z.string().max(100).nullable().optional(),
  insurerName: z.string().max(200).nullable().optional(),
  insurerContact: z.string().max(2000).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  dateOfInjury: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateLodged: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  injuryDescription: z.string().max(20_000).nullable().optional(),
  bodyPart: z.string().max(200).nullable().optional(),
  mechanismOfInjury: z.string().max(20_000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
});

function toDate(s: string | null | undefined): Date | null | undefined {
  if (s === null) return null;
  if (s === undefined) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    const claims = await prisma.workersCompensationClaim.findMany({
      where: { userId, deleted: false },
      include: {
        incident: { select: { id: true, incidentDate: true, description: true, incidentType: true } },
        createdBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
      orderBy: { dateLodged: "desc" },
    });
    return NextResponse.json({ claims });
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
    if (!subject) throw ApiError.notFound("User not found");

    // Optional incident sanity check.
    if (data.incidentId) {
      const inc = await prisma.incidentRecord.findUnique({
        where: { id: data.incidentId },
        select: { id: true },
      });
      if (!inc) throw ApiError.badRequest("Linked incident not found.");
    }

    const created = await prisma.workersCompensationClaim.create({
      data: {
        userId: data.userId,
        incidentId: data.incidentId ?? null,
        claimNumber: data.claimNumber ?? null,
        insurerName: data.insurerName ?? null,
        insurerContact: data.insurerContact ?? null,
        status: data.status ?? "lodged",
        dateOfInjury: toDate(data.dateOfInjury)!,
        dateLodged: toDate(data.dateLodged)!,
        injuryDescription: data.injuryDescription ?? null,
        bodyPart: data.bodyPart ?? null,
        mechanismOfInjury: data.mechanismOfInjury ?? null,
        notes: data.notes ?? null,
        createdById: session!.user.id,
      },
      include: {
        incident: { select: { id: true, incidentDate: true, description: true, incidentType: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "workers_comp_claim_created",
        entityType: "WorkersCompensationClaim",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: subject.name,
          claimNumber: data.claimNumber,
          incidentId: data.incidentId ?? null,
        },
      },
    });

    logger.info("Workers comp claim created", {
      claimId: created.id,
      subjectUserId: data.userId,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
