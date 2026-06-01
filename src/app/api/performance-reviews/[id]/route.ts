/**
 * GET    /api/performance-reviews/[id] — single review (with goals)
 * PATCH  /api/performance-reviews/[id] — update fields
 * DELETE /api/performance-reviews/[id] — soft-delete (owner only)
 *
 * Visibility (phase 1):
 *   - admin / owner / head_office: full read/write
 *   - the subject: read-only on their own review (privateNotes stripped),
 *     can PATCH `selfAssessment*` while status = self_assessment,
 *     can PATCH `acknowledgement*` while status = awaiting_acknowledgement
 *   - everyone else: 403
 *
 * Goal CRUD lands in phase 2. For now goals are loaded on GET and
 * created/updated in batches via the same endpoint (`goals` array
 * in the PATCH body) — keeps the modal simple.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const STATUSES = [
  "scheduled",
  "self_assessment",
  "manager_review",
  "awaiting_acknowledgement",
  "completed",
  "cancelled",
] as const;

const RATINGS = [
  "below_expectations",
  "partially_meeting",
  "meeting_expectations",
  "exceeding_expectations",
  "exceptional",
] as const;

const GOAL_STATUSES = [
  "not_started",
  "in_progress",
  "achieved",
  "not_achieved",
  "deferred",
] as const;

// Goals embedded in the PATCH body. `id` present → update existing,
// absent → create new. Goals NOT included in the array are left alone
// (we don't auto-delete; goals deletion comes via DELETE on a future
// /goals endpoint).
const goalInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(GOAL_STATUSES).optional(),
  progressNotes: z.string().max(20_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const patchSchema = z.object({
  reviewerUserId: z.string().min(1).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  selfAssessment: z.string().max(20_000).nullable().optional(),
  selfStrengths: z.string().max(20_000).nullable().optional(),
  selfImprovements: z.string().max(20_000).nullable().optional(),
  managerAssessment: z.string().max(20_000).nullable().optional(),
  managerStrengths: z.string().max(20_000).nullable().optional(),
  managerImprovements: z.string().max(20_000).nullable().optional(),
  overallRating: z.enum(RATINGS).nullable().optional(),
  acknowledgementNotes: z.string().max(20_000).nullable().optional(),
  privateNotes: z.string().max(20_000).nullable().optional(),
  // Workflow actions — booleans that trigger the timestamp + status
  // transitions on the server (so we don't trust the client to set
  // status correctly).
  submitSelfAssessment: z.boolean().optional(),
  submitManagerAssessment: z.boolean().optional(),
  acknowledge: z.boolean().optional(),
  goals: z.array(goalInputSchema).max(20).optional(),
});

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadReview(id: string) {
  const r = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      goals: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!r || r.deleted) throw ApiError.notFound("Performance review not found");
  return r;
}

type ReviewWithRels = Awaited<ReturnType<typeof loadReview>>;

function stripPrivate(review: ReviewWithRels): ReviewWithRels {
  return { ...review, privateNotes: null };
}

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  const r = await loadReview(id);

  const role = session!.user.role;
  const callerId = session!.user.id;
  const isAdmin = ADMIN_ROLES.has(role);
  const isSubject = r.userId === callerId;

  if (!isAdmin && !isSubject) throw ApiError.forbidden();

  return NextResponse.json(isAdmin ? r : stripPrivate(r));
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  const existing = await loadReview(id);

  const role = session!.user.role;
  const callerId = session!.user.id;
  const isAdmin = ADMIN_ROLES.has(role);
  const isSubject = existing.userId === callerId;

  if (!isAdmin && !isSubject) throw ApiError.forbidden();

  const raw = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }
  const p = parsed.data;

  // Subject-only paths: they can fill self-assessment OR acknowledge,
  // depending on status. Anything else from a non-admin is forbidden.
  if (!isAdmin) {
    const selfFields = [
      "selfAssessment",
      "selfStrengths",
      "selfImprovements",
      "submitSelfAssessment",
    ] as const;
    const ackFields = ["acknowledgementNotes", "acknowledge"] as const;

    const touched = (Object.keys(p) as (keyof typeof p)[]).filter(
      (k) => p[k] !== undefined,
    );

    const selfOnly = touched.every((k) =>
      (selfFields as readonly string[]).includes(k),
    );
    const ackOnly = touched.every((k) =>
      (ackFields as readonly string[]).includes(k),
    );

    if (selfOnly) {
      if (existing.status !== "self_assessment") {
        throw ApiError.forbidden(
          "Self-assessment is not open on this review.",
        );
      }
    } else if (ackOnly) {
      if (existing.status !== "awaiting_acknowledgement") {
        throw ApiError.forbidden(
          "This review is not awaiting your acknowledgement.",
        );
      }
    } else {
      throw ApiError.forbidden();
    }
  }

  // Build the update payload.
  const update: Record<string, unknown> = {};
  const now = new Date();

  if (p.reviewerUserId !== undefined) update.reviewerUserId = p.reviewerUserId;
  if (p.dueDate !== undefined) update.dueDate = new Date(p.dueDate);
  if (p.periodStart !== undefined)
    update.periodStart = new Date(p.periodStart);
  if (p.periodEnd !== undefined) update.periodEnd = new Date(p.periodEnd);
  if (p.selfAssessment !== undefined) update.selfAssessment = p.selfAssessment;
  if (p.selfStrengths !== undefined) update.selfStrengths = p.selfStrengths;
  if (p.selfImprovements !== undefined)
    update.selfImprovements = p.selfImprovements;
  if (p.managerAssessment !== undefined)
    update.managerAssessment = p.managerAssessment;
  if (p.managerStrengths !== undefined)
    update.managerStrengths = p.managerStrengths;
  if (p.managerImprovements !== undefined)
    update.managerImprovements = p.managerImprovements;
  if (p.overallRating !== undefined) update.overallRating = p.overallRating;
  if (p.acknowledgementNotes !== undefined)
    update.acknowledgementNotes = p.acknowledgementNotes;
  if (p.privateNotes !== undefined && isAdmin)
    update.privateNotes = p.privateNotes;
  if (p.status !== undefined && isAdmin) update.status = p.status;

  // Workflow transitions (server-managed, never trust the client).
  if (p.submitSelfAssessment) {
    update.selfSubmittedAt = now;
    // Self submission moves the cycle forward to manager review.
    if (existing.status === "self_assessment") {
      update.status = "manager_review";
    }
  }
  if (p.submitManagerAssessment && isAdmin) {
    update.managerSubmittedAt = now;
    if (existing.status === "manager_review") {
      update.status = "awaiting_acknowledgement";
    }
  }
  if (p.acknowledge) {
    update.acknowledgedAt = now;
    if (existing.status === "awaiting_acknowledgement") {
      update.status = "completed";
      update.completedAt = now;
    }
  }

  // Admin can also manually mark completed/cancelled — stamp completedAt
  // when status transitions to completed by hand.
  if (p.status === "completed" && existing.status !== "completed") {
    update.completedAt = now;
  }
  if (p.status === "cancelled" && existing.status !== "cancelled") {
    update.completedAt = update.completedAt ?? null;
  }

  // Validate period ordering if any of the period/due dates moved.
  const finalPeriodStart = (update.periodStart as Date) ?? existing.periodStart;
  const finalPeriodEnd = (update.periodEnd as Date) ?? existing.periodEnd;
  const finalDueDate = (update.dueDate as Date) ?? existing.dueDate;
  if (finalPeriodEnd < finalPeriodStart) {
    throw ApiError.badRequest("periodEnd must be on or after periodStart");
  }
  if (finalDueDate < finalPeriodEnd) {
    throw ApiError.badRequest("dueDate must be on or after periodEnd");
  }

  // Apply update + handle nested goals in a single transaction so the
  // review state and its goals never get out of sync if one half fails.
  await prisma.$transaction(async (tx) => {
    await tx.performanceReview.update({
      where: { id },
      data: update,
    });

    // Goals: only admins can mutate them in phase 1.
    if (isAdmin && p.goals) {
      // Defensive scope check — building the allow-list of existing
      // goal IDs that DO belong to this review prevents a forged
      // payload from updating a goal attached to a different review.
      const existingGoalIds = new Set(existing.goals.map((g) => g.id));
      for (const g of p.goals) {
        if (g.id) {
          if (!existingGoalIds.has(g.id)) {
            throw ApiError.badRequest(
              `Goal ${g.id} does not belong to this review`,
            );
          }
          await tx.performanceReviewGoal.update({
            where: { id: g.id },
            data: {
              title: g.title.trim(),
              description: g.description ?? null,
              dueDate: g.dueDate ? new Date(g.dueDate) : null,
              status: g.status,
              progressNotes: g.progressNotes ?? null,
              sortOrder: g.sortOrder ?? 0,
            },
          });
        } else {
          await tx.performanceReviewGoal.create({
            data: {
              reviewId: id,
              title: g.title.trim(),
              description: g.description ?? null,
              dueDate: g.dueDate ? new Date(g.dueDate) : null,
              status: g.status ?? "not_started",
              progressNotes: g.progressNotes ?? null,
              sortOrder: g.sortOrder ?? 0,
            },
          });
        }
      }
    }
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "performance_review_updated",
      entityType: "PerformanceReview",
      entityId: id,
      // JSON round-trip — Prisma's JSON column rejects bare
      // Record<string, unknown>. Same pattern as performance cases.
      details: JSON.parse(
        JSON.stringify({
          changedKeys: Object.keys(update),
          previousStatus: existing.status,
          subjectUserId: existing.userId,
          actorRole: role,
        }),
      ),
    },
  });

  logger.info("Performance review updated", {
    reviewId: id,
    actorId: session!.user.id,
    actorRole: role,
    changedKeys: Object.keys(update),
  });

  // Reload with relations so the client gets a fresh complete view.
  const fresh = await loadReview(id);
  return NextResponse.json(isAdmin ? fresh : stripPrivate(fresh));
});

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const r = await loadReview(id);

    await prisma.performanceReview.update({
      where: { id },
      data: { deleted: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "performance_review_deleted",
        entityType: "PerformanceReview",
        entityId: id,
        details: {
          subjectUserId: r.userId,
          type: r.type,
          status: r.status,
        },
      },
    });

    logger.warn("Performance review soft-deleted", {
      reviewId: id,
      actorId: session!.user.id,
      subjectUserId: r.userId,
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner"] },
);
