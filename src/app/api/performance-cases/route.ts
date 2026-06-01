/**
 * GET  /api/performance-cases?userId=X — list cases for a staff member
 * POST /api/performance-cases              — create a new case
 *
 * Visibility:
 *   - owner: sees everything (including `confidential` cases)
 *   - admin / head_office: sees non-confidential cases
 *   - everyone else: 403
 *
 * Cases are NEVER visible to the case's subject (`userId`) through
 * this surface — managers communicate outcomes via existing 1:1 /
 * email channels. This is by design; staff portals will surface
 * "you have an active PIP review on YYYY" labels in a future PR,
 * not the full case detail.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const TYPES = [
  "verbal_warning",
  "written_warning",
  "final_warning",
  "pip",
  "grievance",
  "allegation",
  "commendation",
  "conversation",
] as const;

const STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "escalated",
  "closed",
] as const;

const createSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(TYPES),
  status: z.enum(STATUSES).optional(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(20_000),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid occurredAt"),
  followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  outcome: z.string().max(20_000).optional().nullable(),
  fileUrl: z.string().url().optional().nullable(),
  fileName: z.string().max(255).optional().nullable(),
  confidential: z.boolean().optional(),
});

export const GET = withApiAuth(
  async (req, session) => {
    const role = session!.user.role;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    // Owner sees everything; admin/head_office can't see confidential ones.
    const where = {
      userId,
      deleted: false,
      ...(role === "owner" ? {} : { confidential: false }),
    };

    const cases = await prisma.performanceCase.findMany({
      where,
      include: {
        raisedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ cases });
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

    // Confirm the subject exists (and prevent typo'd userIds writing
    // orphaned cases that don't appear anywhere).
    const subject = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true },
    });
    if (!subject) throw ApiError.notFound("Subject user not found");

    const created = await prisma.performanceCase.create({
      data: {
        userId: data.userId,
        raisedById: session!.user.id,
        type: data.type,
        status: data.status ?? "open",
        title: data.title.trim(),
        summary: data.summary.trim(),
        occurredAt: new Date(data.occurredAt),
        followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
        outcome: data.outcome ?? null,
        fileUrl: data.fileUrl ?? null,
        fileName: data.fileName ?? null,
        confidential: data.confidential ?? false,
      },
      include: {
        raisedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    // Activity log entry — every case touch leaves an audit trail. This
    // is the "show me what happened and when" record Fair Work asks for.
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "performance_case_created",
        entityType: "PerformanceCase",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: subject.name,
          type: data.type,
          confidential: data.confidential ?? false,
        },
      },
    });

    logger.info("Performance case created", {
      caseId: created.id,
      subjectUserId: data.userId,
      type: data.type,
      raisedById: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
