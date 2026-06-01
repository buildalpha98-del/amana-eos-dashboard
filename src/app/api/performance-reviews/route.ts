/**
 * GET  /api/performance-reviews?userId=X  — list reviews for a subject
 * GET  /api/performance-reviews?mine=1    — list reviews where caller is subject
 * POST /api/performance-reviews           — create a new review cycle
 *
 * Visibility (phase 1):
 *   - admin / owner / head_office: full read on any subject; can POST
 *   - self (the subject): read their own reviews via `?mine=1` — they
 *     don't see `privateNotes` in the response (stripped serverside)
 *   - everyone else: 403
 *
 * Goals are nested but managed via their own endpoint (phase 2) —
 * this endpoint returns them embedded for convenience.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const TYPES = ["probation", "mid_year", "annual", "ad_hoc"] as const;

const createSchema = z.object({
  userId: z.string().min(1),
  reviewerUserId: z.string().min(1).nullable().optional(),
  type: z.enum(TYPES),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid periodStart"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid periodEnd"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid dueDate"),
  privateNotes: z.string().max(20_000).optional().nullable(),
});

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

function stripPrivate<T extends { privateNotes?: string | null }>(review: T): T {
  // Subjects never see privateNotes. Cheaper than building a parallel
  // select shape — just drop the field before serialising.
  const { privateNotes: _omit, ...rest } = review;
  void _omit;
  return rest as T;
}

export const GET = withApiAuth(async (req, session) => {
  const role = session!.user.role;
  const callerId = session!.user.id;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const mine = searchParams.get("mine") === "1";

  // Resolve the subject of the query.
  // - mine=1 → caller's own reviews (any role, including non-admin)
  // - userId set → admin path; non-admins can only query themselves
  let subjectId: string;
  if (mine) {
    subjectId = callerId;
  } else if (!userId) {
    throw ApiError.badRequest("userId or mine=1 is required");
  } else if (userId === callerId) {
    subjectId = callerId;
  } else {
    if (!ADMIN_ROLES.has(role)) throw ApiError.forbidden();
    subjectId = userId;
  }

  const reviews = await prisma.performanceReview.findMany({
    where: { userId: subjectId, deleted: false },
    include: {
      reviewer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      goals: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
  });

  // Strip privateNotes from rows the subject is reading themselves.
  const isAdmin = ADMIN_ROLES.has(role);
  const out = isAdmin ? reviews : reviews.map(stripPrivate);

  return NextResponse.json({ reviews: out });
});
// NOTE: no `roles:` filter — staff need to read their OWN reviews via
// ?mine=1, so authentication-only is correct. The handler enforces
// "subject must be caller" for non-admin roles inside the body.

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

    // periodEnd >= periodStart, dueDate >= periodEnd. Cheap sanity check
    // that prevents typos producing nonsense cycles.
    if (data.periodEnd < data.periodStart) {
      throw ApiError.badRequest("periodEnd must be on or after periodStart");
    }
    if (data.dueDate < data.periodEnd) {
      throw ApiError.badRequest("dueDate must be on or after periodEnd");
    }

    // Confirm subject exists.
    const subject = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true },
    });
    if (!subject) throw ApiError.notFound("Subject user not found");

    // Confirm reviewer exists (if provided).
    if (data.reviewerUserId) {
      const reviewer = await prisma.user.findUnique({
        where: { id: data.reviewerUserId },
        select: { id: true },
      });
      if (!reviewer) throw ApiError.notFound("Reviewer user not found");
    }

    const created = await prisma.performanceReview.create({
      data: {
        userId: data.userId,
        reviewerUserId: data.reviewerUserId ?? null,
        createdById: session!.user.id,
        type: data.type,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        dueDate: new Date(data.dueDate),
        privateNotes: data.privateNotes ?? null,
      },
      include: {
        reviewer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        goals: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "performance_review_created",
        entityType: "PerformanceReview",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: subject.name,
          type: data.type,
          dueDate: data.dueDate,
        },
      },
    });

    logger.info("Performance review created", {
      reviewId: created.id,
      subjectUserId: data.userId,
      type: data.type,
      createdById: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
